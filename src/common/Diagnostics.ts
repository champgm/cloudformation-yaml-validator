import vscode from 'vscode';
import clone from 'lodash.clonedeep';

import { RowColumnPosition, getRowColumnPosition } from './RowColumnPosition';
import { Node } from '../Yaml/Node';
import { NodeTraversal } from '../Yaml/NodeTraversal';
import { ReferenceTypes } from './ReferenceTypes';
import { Maps } from './Maps';

export function createDiagnostic(position: RowColumnPosition, length: number, severity: vscode.DiagnosticSeverity, message: string) {
  const range = createVsCodeRange(position, length);
  return new vscode.Diagnostic(range, message, severity);
}

export function createVsCodeRange(rowColumnPosition: RowColumnPosition, length: number): vscode.Range {
  return new vscode.Range(
    rowColumnPosition.line,
    rowColumnPosition.column,
    rowColumnPosition.line,
    rowColumnPosition.column + length,
  );
}

export function addDiagnostic(uri: vscode.Uri, newDiagnostic: vscode.Diagnostic, diagnosticCollection: vscode.DiagnosticCollection) {
  const existingDiagnostics = diagnosticCollection.get(uri) || [];
  diagnosticCollection.set(uri, [...existingDiagnostics, newDiagnostic]);
}

export function createDiagnosticsFromReferencingNode(
  node: Node,
  traversal: NodeTraversal,
  diagnosticCollection: vscode.DiagnosticCollection,
) {
  // If the node has explicit references listed, check those references and create diagnostics as necessary
  node.references.forEach((reference) => {
    // This might reference a stack output. If so, save that tidbit for later.
    const referencesAnOutput = reference.referencedKey.indexOf('.Outputs') > -1;

    // This might be a reference to a resource's native attribute.
    if (!referencesAnOutput) {
      const keyPieces = reference.referencedKey.split('.');
      if (keyPieces.length > 1) {
        // If that's the case, just check to make sure the resource exists.
        const referencedResource = keyPieces[0];
        if (traversal.localDefinitions.indexOf(referencedResource) < 0) {
          const message = Maps.referenceTypeToDiagnosticMessage[ReferenceTypes.REF](referencedResource);
          const position = getRowColumnPosition(traversal.fullText, reference.absoluteKeyPosition);
          const diagnostic = createDiagnostic(position, referencedResource.length, vscode.DiagnosticSeverity.Error, message);
          addDiagnostic(traversal.documentUri, diagnostic, diagnosticCollection);
        }
        return;
      }
    }

    // If it's a !GetAtt reference
    if (reference.type === ReferenceTypes.GET_ATT) {
      // Check sub stack outputs if it's an outputs reference
      const noMatchingSubStackOutput = traversal.subStackDefinitions.outputs.indexOf(reference.referencedKey) < 0;
      if (referencesAnOutput && noMatchingSubStackOutput) {
        const message = Maps.referenceTypeToDiagnosticMessage[reference.type](reference.referencedKey);
        const position = getRowColumnPosition(traversal.fullText, reference.absoluteKeyPosition);
        const diagnostic = createDiagnostic(position, reference.referencedKey.length, vscode.DiagnosticSeverity.Error, message);
        addDiagnostic(traversal.documentUri, diagnostic, diagnosticCollection);
      }
      return;
    }

    // Otherwise, check local referenceables, this encompasses all !Ref, !Sub, !FindInMap, and !If types
    if (traversal.localDefinitions.indexOf(reference.referencedKey) < 0) {
      const message = Maps.referenceTypeToDiagnosticMessage[reference.type](reference.referencedKey);
      const position = getRowColumnPosition(traversal.fullText, reference.absoluteKeyPosition);
      const diagnostic = createDiagnostic(position, reference.referencedKey.length, vscode.DiagnosticSeverity.Error, message);
      addDiagnostic(traversal.documentUri, diagnostic, diagnosticCollection);
    }
  });
}

export function createDiagnosticsFromSubStackNode(
  node: Node,
  traversal: NodeTraversal,
  diagnosticCollection: vscode.DiagnosticCollection) {
  const properties = node.getItemAsNode('Properties');
  // Get the template URL and matching parameters for the sub stack
  const templateUrl = properties.getItemAsString('TemplateURL');
  if (typeof templateUrl === 'string') {
    // Get the parameters used and the referenceable parameters (make a clone, we wil edit this list)
    const parameters = properties.getItemAsNode('Parameters');

    const referenceableParameters = clone(traversal.subStackDefinitions.parameters[templateUrl]) || [];

    // Iterate over each of the current file's parameter references and create diagnostics if necessary
    parameters.items.forEach((parameterPair) => {
      const matchingParameter = referenceableParameters.find((referenceableParameter) => {
        return parameterPair.stringKey === referenceableParameter.parameterName;
      });
      if (matchingParameter) {
        // If there's a matching parameter in the file, awesome, take it out of the list so we can inspect remainders
        referenceableParameters.splice(referenceableParameters.indexOf(matchingParameter), 1);
      } else {
        // Otherwise, there's a reference to a parameter which does not exist, let's make a diagnostic.
        const keyNode = parameterPair.key as Node;
        const position = getRowColumnPosition(traversal.fullText, keyNode.range[0]);
        const stringKey = parameterPair.stringKey as string;
        const diagnostic = createDiagnostic(
          position,
          stringKey.length,
          vscode.DiagnosticSeverity.Error,
          `Referenced file does not have parameter, '${parameterPair.stringKey}'`,
        );
        addDiagnostic(traversal.documentUri, diagnostic, diagnosticCollection);
      }
    });

    // Now that that's done, let's look at the parameters which were not referenced
    // Some might have default values, and that's fine, but a warning might be helpful
    if (referenceableParameters.length > 0) {
      const propertiesPair = properties.getItemAsNode('Parameters');
      if (!propertiesPair) return;
      const propertiesPosition = getRowColumnPosition(traversal.fullText, (propertiesPair.key as Node).range[0]);
      referenceableParameters.forEach((referenceableParameter) => {
        const message = referenceableParameter.hasDefault
          ? `Properties missing value for parameter with default value, '${referenceableParameter.parameterName}'`
          : `Properties missing value for required parameter, '${referenceableParameter.parameterName}'`;
        const severity = referenceableParameter.hasDefault
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Error;
        const diagnostic = createDiagnostic(propertiesPosition, 'Properties'.length, severity, message);
        addDiagnostic(traversal.documentUri, diagnostic, diagnosticCollection);
      });
    }
  }
}
