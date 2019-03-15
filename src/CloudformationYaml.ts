import fs from 'fs';
import * as vscode from 'vscode';

import YAML from 'yaml';
import get from 'lodash.get';
import clone from 'lodash.clonedeep';
import { revealAllProperties, flattenArray } from './util';

interface Reference {
  absoluteKeyPosition: number;
  referencedKey: string;
}

enum NodeTypes {
  MAP = 'MAP',
  PAIR = 'PAIR',
  PLAIN = 'PLAIN',
  FLOW_SEQ = 'FLOW_SEQ',
  QUOTE_DOUBLE = 'QUOTE_DOUBLE',
}

interface Node {
  type: string;
  cstNode: any;
  items?: Node[];
  range: number[];
  references: Reference[];
  tag: string;
  has?: (key: string) => boolean;
  [key: string]: any;
}

interface LocalReferenceables {
  conditions: string[];
  mappings: string[];
  parameters: string[];
  resources: string[];
}

interface SubStackReferenceables {
  outputs: string[];
  parameters: SubStackParameterReferenceablesMap;
}

interface SubStackParameterReferenceablesMap {
  [templateUrl: string]: SubStackParameterReferenceable[];
}

interface SubStackParameterReferenceable {
  parameterName: string;
  hasDefault: boolean;
}

export const diagnosticCollectionName = 'CloudFormation Yaml Validator';

export class CloudformationYaml {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(diagnosticCollectionName);
  }

  public activate(context: vscode.ExtensionContext) {
    this.diagnosticCollection = this.diagnosticCollection
      ? this.diagnosticCollection
      : vscode.languages.createDiagnosticCollection(diagnosticCollectionName);
    const subscriptions: vscode.Disposable[] = context.subscriptions;
    if (subscriptions.indexOf(this) < 0) {
      subscriptions.push(this);
    }
    vscode.workspace.onDidOpenTextDocument(this.checkYaml, this, subscriptions);
    vscode.workspace.onDidCloseTextDocument((textDocument) => { this.diagnosticCollection.delete(textDocument.uri); }, null, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.checkYaml, this, subscriptions);
    vscode.workspace.onDidChangeTextDocument(this.checkYaml, this, subscriptions);
  }

  public checkYaml() {
    try {
      const editor: vscode.TextEditor = vscode.window.activeTextEditor as vscode.TextEditor;
      if (get(editor, 'document.languageId') === 'yaml') {
        const text = editor.document.getText();
        const document = YAML.parseDocument(text, { keepCstNodes: true });

        // Check all !Ref and !Sub tags
        const localReferenceables = this.getLocalReferenceables(document);
        const localResourceReferencingNodes = this.getNodesWhichReferenceLocalResources(document);
        const referenceableKeys = localReferenceables.parameters
          .concat(localReferenceables.resources)
          .concat(localReferenceables.mappings)
          .concat(localReferenceables.conditions);
        const invalidLocalResourceReferenceDiagnostics = this.buildInvalidReferenceDiagnostics(text, referenceableKeys, localResourceReferencingNodes);

        // Check all !GetAtt tags
        const subStackNodePairs = this.findSubStackNodePairs(document);
        const rootFilePath = editor.document.fileName;
        const parentPath = `${rootFilePath.substring(0, rootFilePath.lastIndexOf('/'))}`;
        const subStackReferenceables = this.getSubStackReferenceables(subStackNodePairs, parentPath);
        const subStackAttributeReferencingNodes = this.getNodesWhichReferenceSubstackAttributes(document);
        const invalidSubStacAttributeReferenceDiagnostics = this.buildInvalidReferenceDiagnostics(text, subStackReferenceables.outputs, subStackAttributeReferencingNodes);

        // Check parameters in sub stacks to make sure they can be referenced
        const invalidSubStackParameterDiagnostics = this.buildInvalidSubStackParameterDiagnostics(text, subStackReferenceables, subStackNodePairs);

        // TODO: what if template URL references a file that doesn't exist?

        const combinedDiagnostics =
          invalidSubStackParameterDiagnostics
            .concat(invalidSubStacAttributeReferenceDiagnostics
              .concat(invalidLocalResourceReferenceDiagnostics));

        this.diagnosticCollection.clear();
        this.diagnosticCollection.set(editor.document.uri, combinedDiagnostics);

        console.log(`diagnostics set`);
      }
    } catch (error) {
      console.log(`${diagnosticCollectionName} encountered an error: ${JSON.stringify(revealAllProperties(error), null, 2)}`);
      vscode.window.showErrorMessage(`${diagnosticCollectionName}: ${error.message}`);
    }
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
    const nodeValue = this.getNodeValueIfPair(node);
    if (nodeValue) {
      if (nodeValue.type === NodeTypes.MAP && nodeValue.items) {
        if (nodeValue.get('Type') === 'AWS::CloudFormation::Stack') {
          return [node];
        }
        const subStackNodePairs = nodeValue.items.map((nodePair) => {
          return this.getSubStackNodePairs(nodePair);
        });
        return flattenArray(subStackNodePairs);
      }
    }
    return [];
  }

  private buildInvalidSubStackParameterDiagnostics(fullText: string, subStackReferenceables: SubStackReferenceables, subStackNodePairs: Node[]): vscode.Diagnostic[] {
    const subStackParameterDiagnostics: vscode.Diagnostic[] = [];
    subStackNodePairs.forEach((subStackNodePair) => {
      // Get the Properties sub node and abort if it's missing or invalid
      const subStackNodeValue = subStackNodePair.value;
      const properties = this.getNodeValueIfPair(this.getNodeItemByStringKey(subStackNodeValue, 'Properties'));
      if (!properties) return;

      // Get the Parameters sub node and abort if it's missing or invalid
      const parameters = this.getNodeValueIfPair(this.getNodeItemByStringKey(properties, 'Parameters'));
      if (!parameters || !parameters.items) return;

      // Get the template URL and matching parameters for the sub stack
      const templateUrl = properties.get('TemplateURL');
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
          const position = this.getRowColumnPosition(fullText, keyNode.range[0]);
          const parameterRange = new vscode.Range(
            position.line,
            position.column,
            position.line,
            position.column + parameterPair.stringKey.length,
          );
          const diagnostic = new vscode.Diagnostic(
            parameterRange,
            `Referenced file does not have parameter, '${parameterPair.stringKey}'`,
            vscode.DiagnosticSeverity.Error,
          );
          subStackParameterDiagnostics.push(diagnostic);
        }
      });

      // Now that that's done, let's look at the parameters which were not referenced
      // Some might have default values, and that's fine, but a warning might be helpful
      console.log(`referenceableParameters: ${JSON.stringify(referenceableParameters)}`);
      if (referenceableParameters.length > 0) {
        const propertiesPair = this.getNodeItemByStringKey(properties, 'Parameters');
        if (!propertiesPair) return;
        const propertiesPosition = this.getRowColumnPosition(fullText, propertiesPair.key.range[0]);
        const propertiesRange = new vscode.Range(
          propertiesPosition.line,
          propertiesPosition.column,
          propertiesPosition.line,
          propertiesPosition.column + 'Properties'.length,
        );
        referenceableParameters.forEach((referenceableParameter) => {
          const message = referenceableParameter.hasDefault
            ? `Properties missing value for parameter with default value, '${referenceableParameter.parameterName}'`
            : `Properties missing value for required parameter, '${referenceableParameter.parameterName}'`
          const severity = referenceableParameter.hasDefault
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error;
          const diagnostic = new vscode.Diagnostic(propertiesRange, message, severity);
          subStackParameterDiagnostics.push(diagnostic);
        });
      }
    });
    return subStackParameterDiagnostics;
  }

  private getSubStackReferenceables(nodePairs: any[], parentPath: string): SubStackReferenceables {
    const referenceableOutputs: string[] = [];
    const referenceableParameters: SubStackParameterReferenceablesMap = {};
    nodePairs.forEach((nodePair) => {
      const properties = nodePair.value.get('Properties');
      if (properties) {
        const templateUrl = properties.get('TemplateURL');
        referenceableParameters[templateUrl] = [];
        if (templateUrl) {
          const filePath = `${parentPath}/${templateUrl}`;
          const fileText = fs.readFileSync(filePath, 'utf8');
          const document: any = YAML.parseDocument(fileText, { keepCstNodes: true });

          const outputs = document.contents.get('Outputs');
          const outputKeys = this.getYamlNodeKeys(outputs);
          outputKeys.forEach((key) => {
            referenceableOutputs.push(`${nodePair.stringKey}.Outputs.${key}`);
          });

          const parameters: Node = document.contents.get('Parameters');
          if (parameters && parameters.items) {
            parameters.items.forEach((item) => {
              if (item.type === NodeTypes.PAIR && item.value) {
                const defaultValue = item.value.get('Default');
                referenceableParameters[templateUrl].push({
                  parameterName: item.stringKey,
                  hasDefault: !!defaultValue,
                });
              }
            });
          }
          console.log(`paremters`);
        }
      }
    });
    return { outputs: referenceableOutputs, parameters: referenceableParameters };
  }

  private getNodesWhichReferenceSubstackAttributes(document: any) {
    const resources = document.get('Resources');
    const outputs = document.get('Outputs');
    return this.getSubNodesWhichReferenceSubstackAttributes(resources)
      .concat(this.getSubNodesWhichReferenceSubstackAttributes(outputs));
  }

  private getSubNodesWhichReferenceSubstackAttributes(node: Node): Node[] {
    if (!node) return [];
    const nodeValue = this.getNodeValueIfPair(node);
    if (nodeValue) {
      if ((nodeValue.type === NodeTypes.FLOW_SEQ || nodeValue.type === NodeTypes.MAP) && nodeValue.items) {
        const subNodes = nodeValue.items.map((item) => {
          if (!item.tag) {
            item.tag = nodeValue.tag;
          }
          return this.getSubNodesWhichReferenceSubstackAttributes(item);
        });
        return flattenArray(subNodes);
      }

      if (nodeValue.type === NodeTypes.PLAIN || nodeValue.type === NodeTypes.QUOTE_DOUBLE) {
        // Handle nodes with a !Ref tag
        if (nodeValue.tag === '!GetAtt') {
          nodeValue.references = [{
            referencedKey: nodeValue.value,
            // Add 7 because '!GetAtt ' is 7 and the range begins at the beginning of the field
            // Add 1 because... I still don't know why, see !Sub, similar issue.
            // Hey maybe it's counting the space between ':' and '!GetAtt' ?
            // I'm sure it has nothing to do with getRowColumnPosition's logic ^_^
            absoluteKeyPosition: nodeValue.range[0] + 7 + 1,
          }];
          return [nodeValue];
        }
      }
    }
    return [];
  }

  private buildInvalidReferenceDiagnostics(
    fullText: string,
    referenceableKeys: string[],
    referencingNodes: Node[],
  ): vscode.Diagnostic[] {
    const invalidReferences: vscode.Diagnostic[] = [];
    referencingNodes.forEach((node) => {
      node.references.forEach((reference) => {
        if (referenceableKeys.indexOf(reference.referencedKey) < 0) {
          const position = this.getRowColumnPosition(fullText, reference.absoluteKeyPosition);
          const range = new vscode.Range(
            position.line,
            position.column,
            position.line,
            position.column + reference.referencedKey.length,
          );
          const diagnostic = new vscode.Diagnostic(
            range,
            `Unable to find referenced value, '${reference.referencedKey}'`,
            vscode.DiagnosticSeverity.Error,
          );
          invalidReferences.push(diagnostic);
        }
      });
    });
    return invalidReferences;
  }

  private getRowColumnPosition(text: string, absolutePosition: number): { line: number, column: number } {
    // YAML library doesn't have a line + column position, only absolute
    // So we have to count the lines.
    const textBefore = text.substring(0, absolutePosition);

    // This will gather all individual matches (containing metadata about position, etc)
    const matches: RegExpExecArray[] = [];
    const regEx = new RegExp('\r?\n', 'g');
    let match;
    while ((match = (regEx.exec(textBefore) as RegExpExecArray)) != null) {
      matches.push(match);
    }

    // Matches will contain each match on line return
    // the number of matches is the number of line-returns in the file before this position
    // That is also the line (starting from 0) on which this position can be found
    const line = matches.length;

    // The last line return in textBefore is the one before our absolute position
    const lastLineReturn = matches[matches.length - 1];
    const afterLastLineReturn = lastLineReturn.index + lastLineReturn[0].length;

    // So, absolutePosition - afterLastLineReturn should give us the column number for our absolute position
    const column = absolutePosition - afterLastLineReturn;
    return { column, line };
  }

  private getNodesWhichReferenceLocalResources(document: any) {
    const resources = document.get('Resources');
    const outputs = document.get('Outputs');
    return this.getSubNodesWhichReferenceLocalResources(resources)
      .concat(this.getSubNodesWhichReferenceLocalResources(outputs));
  }

  private getSubNodesWhichReferenceLocalResources(node: Node): Node[] {
    if (!node) return [];
    const nodeValue = this.getNodeValueIfPair(node);
    if (nodeValue) {
      if ((nodeValue.type === NodeTypes.FLOW_SEQ || nodeValue.type === NodeTypes.MAP) && nodeValue.items) {
        const subNodes = nodeValue.items.map((item) => {
          if (!item.tag) {
            item.tag = nodeValue.tag;
          }
          return this.getSubNodesWhichReferenceLocalResources(item);
        });
        return flattenArray(subNodes);
      }

      if (nodeValue.type === NodeTypes.PLAIN || nodeValue.type === NodeTypes.QUOTE_DOUBLE) {
        // Handle nodes without a tag, these are probably first members of an !If or !FindInMap
        if (nodeValue.tag === '!If' || nodeValue.tag === '!FindInMap' || nodeValue.stringKey === 'DependsOn') {
          nodeValue.references = [{
            referencedKey: nodeValue.value,
            absoluteKeyPosition: nodeValue.range[0],
          }];
          return [nodeValue];
        }

        // Handle nodes with a !Ref tag, but not ones that reference AWS stuff
        if (
          nodeValue.tag === '!Ref'
          && !(nodeValue.value as string).startsWith('AWS::')
        ) {
          nodeValue.references = [{
            referencedKey: nodeValue.value,
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
            const reference = {
              // Add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
              // Add 2 because we've trimmed off '${'
              // Add 1, I'm not really sure why. Maybe something about match.index starting at 0?
              absoluteKeyPosition: nodeValue.range[0] + 5 + 2 + match.index + 1,
              // Trim the ${} off of the match
              referencedKey: match[0].substring(2, match[0].length - 1),
            };
            nodeValue.references.push(reference);
          }
          return [nodeValue];
        }
      }
    }
    return [];
  }

  private getNodeValueIfPair(node: Node | undefined): Node | undefined {
    if (!node) return undefined;
    const nodeValue: Node = node.type === NodeTypes.PAIR ? get(node, 'value') : node;
    nodeValue.stringKey = nodeValue.stringKey ? nodeValue.stringKey : node.stringKey;
    return nodeValue;
  }

  private getNodeItemByStringKey(node: Node, stringKey: string): Node | undefined {
    if (node && node.items) {
      return node.items.find((nodePair: Node) => {
        return nodePair.stringKey === stringKey;
      });
    }
    return undefined;
  }

  private getLocalReferenceables(document: any): LocalReferenceables {
    const parameters = document.get('Parameters');
    const resources = document.get('Resources');
    const conditions = document.get('Conditions');
    const mappings = document.get('Mappings');
    return {
      parameters: this.getYamlNodeKeys(parameters),
      resources: this.getYamlNodeKeys(resources),
      mappings: this.getYamlNodeKeys(mappings),
      conditions: this.getYamlNodeKeys(conditions),
    };
  }

  private getYamlNodeKeys(yamlNode: any): string[] {
    if (yamlNode && yamlNode.items) {
      return yamlNode.items.map((itemNode) => {
        return itemNode.stringKey;
      });
    }
    return [];
  }

  public dispose() {
    if (this.diagnosticCollection) {
      this.diagnosticCollection.clear();
      this.diagnosticCollection.dispose();
    }
  }

  public reset() {
    if (this.diagnosticCollection) {
      this.diagnosticCollection.clear();
    }
  }
}
