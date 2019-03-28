import * as vscode from 'vscode';
import clone from 'lodash.clonedeep';
import fs from 'fs';
import path from 'path';
import get from 'lodash.get';
import YAML from 'yaml';

import { createDiagnostic } from './common/Diagnostics';
import { getYamlNodeKeys, getNodeValueIfPair, getNodeItemByStringKey } from './common/Yaml';
import { Maps } from './common/Maps';
import { Node } from './interfaces/Node';
import { NodeTypes } from './common/NodeTypes';
import { Referenceables } from './interfaces/Referenceables';
import { ReferenceTypes } from './common/ReferenceTypes';
import { revealAllProperties, flattenArray, getRowColumnPosition } from './common';
import { SubStackParameterReferenceablesMap } from './interfaces/SubStackParameterReferenceablesMap';
import { SubStackReferenceables } from './interfaces/SubStackReferenceables';

export const diagnosticCollectionName = 'CloudFormation Yaml Validator';

export class CloudformationYaml {
  private diagnosticCollection: vscode.DiagnosticCollection;
  public urisCurrentlyBeingProcessed: vscode.Uri[] = [];
  private subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(diagnosticCollectionName);
  }

  public activate(context: vscode.ExtensionContext) {
    this.diagnosticCollection = this.diagnosticCollection
      ? this.diagnosticCollection
      : vscode.languages.createDiagnosticCollection(diagnosticCollectionName);
    this.subscriptions = context.subscriptions;
    if (this.subscriptions.indexOf(this) < 0) {
      this.subscriptions.push(this);
    }
    // vscode.window.onDidChangeActiveTextEditor(this.checkSingleYaml, this, subscriptions);
    vscode.workspace.onDidOpenTextDocument(this.checkSingleYaml, this, this.subscriptions);
    vscode.workspace.onDidCloseTextDocument(this.deleteDiagnostics, this, this.subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.checkSingleYaml, this, this.subscriptions);
    vscode.workspace.onDidChangeTextDocument(this.checkSingleYaml, this, this.subscriptions);
  }

  public deactivate() {
    this.subscriptions.forEach((subscription) => {
      subscription.dispose();
    });
  }

  public async checkSingleYaml() {
    await this.checkActiveFile(false, true);
  }

  public async checkActiveFile(recurse: boolean, isRoot: boolean) {
    const editor: vscode.TextEditor = vscode.window.activeTextEditor as vscode.TextEditor;
    if (editor) {
      const documentUri = editor.document.uri;
      this.diagnosticCollection.delete(documentUri);
      const fullText = editor.document.getText();
      const document = YAML.parseDocument(fullText, { keepCstNodes: true });
      const filePath = editor.document.fileName;
      await this.checkYaml(fullText, documentUri, filePath, document, recurse, isRoot);
    }
  }

  public async checkYaml(
    fullText: string,
    documentUri: vscode.Uri,
    filePath: string,
    document: YAML.ast.Document,
    recurse: boolean,
    isRoot: boolean,
  ): Promise<vscode.Diagnostic[]> {
    if (this.urisCurrentlyBeingProcessed.indexOf(documentUri) > -1) {
      return [];
    }
    try {
      this.urisCurrentlyBeingProcessed.push(documentUri);
      // Build a list of referenceable stuff, open sub stack files if necessary
      const referenceables = await this.getReferenceables(fullText, filePath, documentUri, recurse);
      const nodesWhichReference = this.getNodesWhichReference(document);
      this.buildInvalidReferenceDiagnostics(fullText, documentUri, referenceables, nodesWhichReference);

      // Check parameters in sub stacks to make sure they can be referenced
      const subStackNodePairs = this.findSubStackNodePairs(document);
      this.buildInvalidSubStackParameterDiagnostics(fullText, documentUri, referenceables.subStackReferenceables, subStackNodePairs);
    } catch (error) {
      console.error(`${diagnosticCollectionName} encountered an error: ${JSON.stringify(revealAllProperties(error))}`);
      // vscode.window.showErrorMessage(`${diagnosticCollectionName}: ${error.message}`);
    } finally {
      this.urisCurrentlyBeingProcessed.splice(this.urisCurrentlyBeingProcessed.indexOf(documentUri), 1);
    }
    if (recurse && isRoot) {
      vscode.window.showInformationMessage('Done recursing through sub stack YAMLs');
    }
    return documentUri
      ? this.diagnosticCollection.get(documentUri) || []
      : [];
  }

  private deleteDiagnostics(textDocument: vscode.TextDocument) {
    this.diagnosticCollection.delete(textDocument.uri);
  }

  private addDiagnostic(uri: vscode.Uri, newDiagnostic: vscode.Diagnostic) {
    const existingDiagnostics = this.diagnosticCollection.get(uri) || [];
    this.diagnosticCollection.set(uri, [...existingDiagnostics, newDiagnostic]);
  }

  private findSubStackNodePairs(document: any) {
    const documentItems = get(document, 'contents.items');
    if (documentItems) {
      const resources = documentItems.find((item) => {
        return item.stringKey === 'Resources';
      });
      return this.getSubStackNodePairs(resources);
    }
    return [];
  }

  private getSubStackNodePairs(node: Node): Node[] {
    if (!node) return [];
    const nodeValue = getNodeValueIfPair(node);
    if (nodeValue.type === NodeTypes.MAP && nodeValue.items) {
      if (nodeValue.get('Type') === 'AWS::CloudFormation::Stack') {
        return [node];
      }
      const subStackNodePairs = nodeValue.items.map((nodePair) => {
        return this.getSubStackNodePairs(nodePair);
      });
      return flattenArray(subStackNodePairs);
    }
    return [];
  }

  private buildInvalidSubStackParameterDiagnostics(
    fullText: string,
    documentUri: vscode.Uri,
    subStackReferenceables: SubStackReferenceables,
    subStackNodePairs: Node[],
  ): void {
    subStackNodePairs.forEach((subStackNodePair) => {
      const subStackNodeValue = subStackNodePair.value;
      if (!subStackNodeValue || typeof subStackNodeValue === 'string') return;
      const properties = getNodeValueIfPair(getNodeItemByStringKey(subStackNodeValue, 'Properties'));

      // Get the template URL and matching parameters for the sub stack
      const templateUrl = properties.get('TemplateURL');
      if (typeof templateUrl === 'string') {
        const parameters = getNodeValueIfPair(getNodeItemByStringKey(properties, 'Parameters'));
        const referenceableParameters = clone(subStackReferenceables.parameters[templateUrl]);
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
            const keyNode = parameterPair.key;
            const position = getRowColumnPosition(fullText, keyNode.range[0]);
            const stringKey = parameterPair.stringKey as string;
            const diagnostic = createDiagnostic(
              position,
              stringKey.length,
              vscode.DiagnosticSeverity.Error,
              `Referenced file does not have parameter, '${parameterPair.stringKey}'`,
            );
            this.addDiagnostic(documentUri, diagnostic);
          }
        });

        // Now that that's done, let's look at the parameters which were not referenced
        // Some might have default values, and that's fine, but a warning might be helpful
        if (referenceableParameters.length > 0) {
          const propertiesPair = getNodeItemByStringKey(properties, 'Parameters');
          if (!propertiesPair) return;
          const propertiesPosition = getRowColumnPosition(fullText, propertiesPair.key.range[0]);
          referenceableParameters.forEach((referenceableParameter) => {
            const message = referenceableParameter.hasDefault
              ? `Properties missing value for parameter with default value, '${referenceableParameter.parameterName}'`
              : `Properties missing value for required parameter, '${referenceableParameter.parameterName}'`;
            const severity = referenceableParameter.hasDefault
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Error;
            const diagnostic = createDiagnostic(propertiesPosition, 'Properties'.length, severity, message);
            this.addDiagnostic(documentUri, diagnostic);
          });
        }
      }
    });
  }

  private async getSubStackReferenceables(
    fullText: string,
    documentUri: vscode.Uri,
    subStackNodePairs: Node[],
    parentPath: string,
    recurse: boolean,
  ): Promise<SubStackReferenceables> {
    const referenceableOutputs: string[] = [];
    const referenceableParameters: SubStackParameterReferenceablesMap = {};
    // subStackNodePairs.forEach((nodePair) => {
    for (const nodePair of subStackNodePairs) {
      const properties = (nodePair.value as Node).get('Properties') as Node;
      const templateUrl = (properties as Node).get('TemplateURL');
      if (typeof templateUrl === 'string') {
        referenceableParameters[templateUrl] = [];
        const filePath = `${parentPath}/${templateUrl}`;
        let document: any;
        try {
          const fileText = fs.readFileSync(filePath, 'utf8');
          document = YAML.parseDocument(fileText, { keepCstNodes: true });

          if (recurse) {
            // Gather information necessary to check the file
            const uriString = `file://${filePath}`;
            const documentUri = vscode.Uri.parse(uriString);
            const diagnostics = await this.checkYaml(fileText, documentUri, filePath, document, recurse, false);
            // If diagnostics for that file were generated, open it.
            if (diagnostics.length > 0) {
              const textDocument = await vscode.workspace.openTextDocument(documentUri);
              await vscode.window.showTextDocument(textDocument);
            }
          }
        } catch (error) {
          const templateUrlNodePair = getNodeItemByStringKey(properties, 'TemplateURL');
          if (!templateUrlNodePair) break;
          const templateUrlNodeValue = templateUrlNodePair.value as Node;
          const templateUrl = templateUrlNodeValue.value as string;
          const position = getRowColumnPosition(fullText, templateUrlNodeValue.range[0]);
          const diagnostic = createDiagnostic(
            position,
            templateUrl.length,
            vscode.DiagnosticSeverity.Error,
            `Unable to load or parse template file, '${filePath}'. Error encountered: ${JSON.stringify(revealAllProperties(error))}`,
          );
          this.addDiagnostic(documentUri, diagnostic);
          break;
        }
        const outputs = document.contents.get('Outputs');
        const outputKeys = getYamlNodeKeys(outputs);
        outputKeys.forEach((key) => {
          referenceableOutputs.push(`${nodePair.stringKey}.Outputs.${key}`);
        });

        const parameters: Node = document.contents.get('Parameters');
        if (parameters && parameters.items) {
          parameters.items.forEach((item) => {
            if (item.type === NodeTypes.PAIR && item.value && !(typeof item.value === 'string')) {
              const defaultValue = item.value.get('Default');
              referenceableParameters[templateUrl].push({
                parameterName: item.stringKey as string,
                hasDefault: !!defaultValue,
              });
            }
          });
        }
      }
    }
    return {
      outputs: referenceableOutputs,
      parameters: referenceableParameters,
    };
  }

  private buildInvalidReferenceDiagnostics(
    fullText: string,
    documentUri: vscode.Uri,
    referenceables: Referenceables,
    nodesWhichReference: Node[],
  ): void {
    const localReferenceables = referenceables.conditions
      .concat(referenceables.mappings)
      .concat(referenceables.parameters)
      .concat(referenceables.resources);
    nodesWhichReference.forEach((node) => {
      node.references.forEach((reference) => {
        const position = getRowColumnPosition(fullText, reference.absoluteKeyPosition);
        // This might reference a stack output. If so, save that tidbit for later.
        const referencesAnOutput = reference.referencedKey.indexOf('.Outputs') > -1;

        // This might be a reference to a resource's native attribute.
        if (!referencesAnOutput) {
          const keyPieces = reference.referencedKey.split('.');
          if (keyPieces.length > 1) {
            // If that's the case, just check to make sure the resource exists.
            const referencedResource = keyPieces[0];
            if (localReferenceables.indexOf(referencedResource) < 0) {
              const message = Maps.referenceTypeToDiagnosticMessage[ReferenceTypes.REF](referencedResource);
              const diagnostic = createDiagnostic(position, referencedResource.length, vscode.DiagnosticSeverity.Error, message);
              this.addDiagnostic(documentUri, diagnostic);
              return;
            }
            return;
          }
        }

        // If it's a !GetAtt reference
        if (reference.type === ReferenceTypes.GET_ATT) {
          // Check sub stack outputs if it's an outputs reference
          const noMatchingSubStackOutput = referenceables.subStackReferenceables.outputs.indexOf(reference.referencedKey) < 0;
          if (referencesAnOutput && noMatchingSubStackOutput) {
            const message = Maps.referenceTypeToDiagnosticMessage[reference.type](reference.referencedKey);
            const diagnostic = createDiagnostic(position, reference.referencedKey.length, vscode.DiagnosticSeverity.Error, message);
            this.addDiagnostic(documentUri, diagnostic);
            return;
          }
          return;
        }

        // Otherwise, check local referenceables, this encompasses all !Ref, !Sub, !FindInMap, and !If types
        if (localReferenceables.indexOf(reference.referencedKey) < 0) {
          const message = Maps.referenceTypeToDiagnosticMessage[reference.type](reference.referencedKey);
          const diagnostic = createDiagnostic(position, reference.referencedKey.length, vscode.DiagnosticSeverity.Error, message);
          this.addDiagnostic(documentUri, diagnostic);
          return;
        }
      });
    });
  }

  private getNodesWhichReference(document: any) {
    const resources = document.get('Resources');
    const outputs = document.get('Outputs');
    return this.getSubNodesWhichReference(resources)
      .concat(this.getSubNodesWhichReference(outputs));
  }

  private getSubNodesWhichReference(node: Node): Node[] {
    if (!node) return [];
    const nodeValue = getNodeValueIfPair(node);
    // If this is an array, we need to do some tricky stuff.
    if (nodeValue.type === NodeTypes.FLOW_SEQ && nodeValue.items) {
      // Clone the array (we're going to modify it) and grab the first node.
      const items = clone(nodeValue.items);
      const firstSubNode = items.shift();
      if (firstSubNode) {
        // The first node is always (?) a reference to a Map or Conditional
        // But this first node has nothing to distinguish it as such, so propagate the parent node's tag to it
        if (!firstSubNode.tag) firstSubNode.tag = nodeValue.tag;
        const firstSubNodes = this.getSubNodesWhichReference(firstSubNode);

        // Then, handle the rest of the nodes recursively
        const restOfSubNodes = items.map((item) => {
          return this.getSubNodesWhichReference(item);
        });

        return [
          ...firstSubNodes,
          ...flattenArray(restOfSubNodes),
        ];
      }
    }

    // If this is a map, we just need to go deeper.
    if (nodeValue.type === NodeTypes.MAP && nodeValue.items) {
      const subNodes = nodeValue.items.map((item) => {
        if (!item.tag) {
          item.tag = nodeValue.tag;
        }
        return this.getSubNodesWhichReference(item);
      });
      return flattenArray(subNodes);
    }

    // Otherwise, we need to inspect the node
    if (nodeValue.type === NodeTypes.PLAIN || nodeValue.type === NodeTypes.QUOTE_DOUBLE || nodeValue.type === NodeTypes.QUOTE_SINGLE) {
      // Handle nodes without a tag, these are probably first members of an !If or !FindInMap
      const nodeTag = nodeValue.tag || nodeValue.stringKey;
      if (nodeTag === '!If' || nodeTag === '!FindInMap' || nodeTag === 'DependsOn') {
        const referencedKey = nodeValue.value as string;
        if (!referencedKey.startsWith('AWS::')) {
          nodeValue.references = [{
            referencedKey,
            type: Maps.nodeTagToReferenceType[nodeTag],
            absoluteKeyPosition: nodeValue.range[0],
          }];
          return [nodeValue];
        }
      }

      if (nodeValue.tag === '!GetAtt') {
        nodeValue.references = [{
          type: ReferenceTypes.GET_ATT,
          referencedKey: nodeValue.value as string,
          // Add 8 because '!GetAtt ' is 8 and the range begins at the beginning of the field
          absoluteKeyPosition: nodeValue.range[0] + 8,
        }];
        return [nodeValue];
      }

      // Handle nodes with a !Ref tag, but not ones that reference AWS stuff
      if (nodeValue.tag === '!Ref' && !(nodeValue.value as string).startsWith('AWS::')) {
        nodeValue.references = [{
          type: ReferenceTypes.REF,
          referencedKey: nodeValue.value as string,
          // Add 5 because '!Ref ' is 5 and the range begins at the beginning of the field
          absoluteKeyPosition: nodeValue.range[0] + 5,
        }];
        return [nodeValue];
      }

      // Handle nodes with a !Sub tag
      if (nodeValue.tag === '!Sub') {
        // This will find ALL ${references} in the !Sub
        let match: RegExpExecArray;
        nodeValue.references = [];
        const regEx = new RegExp('\\${[^}]*}', 'g');
        while ((match = (regEx.exec(nodeValue.value as string) as RegExpExecArray)) != null) {
          // Trim the ${} off of the match
          const referencedKey = match[0].substring(2, match[0].length - 1);
          if (!referencedKey.startsWith('AWS::')) {
            const quotesOffset = Maps.nodeTypeToSubOffset[nodeValue.type];
            if (quotesOffset !== 0 && quotesOffset !== 1) {
              console.error(`bad offset: ${nodeValue}, ${nodeValue.type}`);
            }
            const reference = {
              referencedKey,
              type: ReferenceTypes.SUB,
              // Add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
              // Add 2 because we've trimmed off '${'
              // Add an offset for quotes (or not)
              absoluteKeyPosition: nodeValue.range[0] + 5 + quotesOffset + 2 + match.index,
            };
            nodeValue.references.push(reference);
          }
        }
        return [nodeValue];
      }
    }
    return [];
  }

  private async getReferenceables(
    documentText: string,
    filePath: string,
    documentUri: vscode.Uri,
    recurse: boolean,
  ): Promise<Referenceables> {
    // const fullText = editor.document.getText();
    const document = YAML.parseDocument(documentText, { keepCstNodes: true });

    if (document.contents) {
      // Get local referenceables, these are just keys of various top-level sections
      const contents = document.contents as Node;
      const parameters = contents.get('Parameters');
      const resources = contents.get('Resources');
      const conditions = contents.get('Conditions');
      const mappings = contents.get('Mappings');

      // Find sub stack referenceables, this will require work.
      const subStackNodePairs = this.findSubStackNodePairs(document);
      // const rootFilePath = editor.document.fileName;
      const parentPath = `${filePath.substring(0, filePath.lastIndexOf(path.sep))}`;
      const subStackReferenceables = await this.getSubStackReferenceables(documentText, documentUri, subStackNodePairs, parentPath, recurse);

      return {
        subStackReferenceables,
        parameters: getYamlNodeKeys(parameters),
        resources: getYamlNodeKeys(resources),
        mappings: getYamlNodeKeys(mappings),
        conditions: getYamlNodeKeys(conditions),
      };
    }
    return {
      parameters: [],
      resources: [],
      mappings: [],
      conditions: [],
      subStackReferenceables: {
        outputs: [],
        parameters: {},
      },
    };
  }

  public dispose() {
    if (this.diagnosticCollection) {
      this.diagnosticCollection.clear();
      this.diagnosticCollection.dispose();
    }
  }

  public async reset() {
    if (this.diagnosticCollection) {
      await this.diagnosticCollection.clear();
    }
  }
}
