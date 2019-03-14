import fs from 'fs';
import * as vscode from 'vscode';

import YAML from 'yaml';
import get from 'lodash.get';
import { revealAllProperties, flattenArray } from './util';

interface Reference {
  keyPositionInValue: number;
  referencedKey: string;
}

interface Node {
  cstNode: any;
  items?: NodePair[];
  range: number[];
  references: Reference[];
  tag: string;
  type: string;
  has?: (key: string) => boolean;
  [key: string]: any;
}

interface NodeKey {
  cstNode: any;
  range: number[];
  type: string;
  value: string;
}

interface NodePair {
  commentBefore?: string;
  key: NodeKey;
  stringKey: string;
  value: Node;
}

interface SubStackReferenceables {
  outputs: string[];
  parameters: { [templateUrl: string]: string[] };
}

export class CloudformationYaml {
  private diagnosticCollectionName = 'CloudFormation Yaml Validator';
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(this.diagnosticCollectionName);
  }

  public activate(context: vscode.ExtensionContext) {
    this.diagnosticCollection = this.diagnosticCollection
      ? this.diagnosticCollection
      : vscode.languages.createDiagnosticCollection(this.diagnosticCollectionName);
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
      if (editor.document.languageId === 'yaml') {
        const text = editor.document.getText();
        const document = YAML.parseDocument(text, { keepCstNodes: true });

        // Check all !Ref and !Sub tags
        const referenceableKeys = this.getLocalReferenceables(document);
        const localResourceReferencingNodes = this.getNodesWhichReferenceLocalResources(document);
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

        const combinedDiagnostics =
          invalidSubStackParameterDiagnostics
            .concat(invalidSubStacAttributeReferenceDiagnostics
              .concat(invalidLocalResourceReferenceDiagnostics));

        this.diagnosticCollection.clear();
        this.diagnosticCollection.set(editor.document.uri, combinedDiagnostics);
      }
    } catch (error) {
      console.log(`${this.diagnosticCollectionName} encountered an error: ${JSON.stringify(revealAllProperties(error), null, 2)}`);
      vscode.window.showErrorMessage(`${this.diagnosticCollectionName}: ${error.message}`);
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

  private getSubStackNodePairs(nodePair: NodePair): NodePair[] {
    const nodeValue = get(nodePair, 'value');
    if (nodeValue) {
      if (nodeValue.has && nodeValue.has('Type')) {
        if (nodeValue.get('Type') === 'AWS::CloudFormation::Stack') {
          return [nodePair];
        }
      }

      // Not a sub stack node, try going deeper
      const items: any[] = get(nodePair, 'value.items');
      if (items && items.length > 0) {
        const subStackNodePairs = items.map((nodePair) => {
          return this.getSubStackNodePairs(nodePair);
        });
        return flattenArray(subStackNodePairs);
      }
    }
    return [];
  }

  private buildInvalidSubStackParameterDiagnostics(fullText: string, subStackReferenceables: SubStackReferenceables, subStackNodePairs: NodePair[]): vscode.Diagnostic[] {
    const subStackParameterDiagnostics: vscode.Diagnostic[] = [];
    subStackNodePairs.forEach((subStackNodePair) => {
      const node = subStackNodePair.value;
      if (node.items) {
        const properties = node.items.find((pair: NodePair) => {
          return pair.stringKey === 'Properties';
        });
        if (properties && properties.value.items) {
          const templateUrl = properties.value.get('TemplateURL');
          const parameters = properties.value.items.find((pair: NodePair) => {
            return pair.stringKey === 'Parameters';
          });
          if (parameters && parameters.value.items) {
            const referenceableParameters = subStackReferenceables.parameters[templateUrl];
            parameters.value.items.forEach((parameterPair) => {
              if (referenceableParameters.indexOf(parameterPair.stringKey) < 0) {
                const keyNode = parameterPair.key;
                const position = this.getRowColumnPosition(fullText, keyNode.range[0]);
                const range = new vscode.Range(
                  position.line,
                  position.column,
                  position.line,
                  position.column + parameterPair.stringKey.length,
                );
                const diagnostic = new vscode.Diagnostic(
                  range,
                  `Referenced file does not have parameter, '${parameterPair.stringKey}'`,
                  vscode.DiagnosticSeverity.Error,
                );
                subStackParameterDiagnostics.push(diagnostic);
              }
            });
          }
        }
      }
    });
    return subStackParameterDiagnostics;
  }

  private getSubStackReferenceables(nodePairs: any[], parentPath: string): SubStackReferenceables {
    const referenceableOutputs: string[] = [];
    const referenceableParameters: { [templateUrl: string]: string[] } = {};
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

          const parameters = document.contents.get('Parameters');
          const parameterKeys = this.getYamlNodeKeys(parameters);
          parameterKeys.forEach((key) => {
            referenceableParameters[templateUrl].push(`${key}`);
          });
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

  private getSubNodesWhichReferenceSubstackAttributes(yamlNode: Node): Node[] {
    if (yamlNode) {
      const keys = this.getYamlNodeKeys(yamlNode);
      if (keys.length > 0) {
        // This means the node is a map, not a node with a value which could contain a reference
        const referenceSubNodes = keys.map((key) => {
          return this.getSubNodesWhichReferenceSubstackAttributes(yamlNode.get(key, true));
        });
        return flattenArray(referenceSubNodes);
      }

      // Handle nodes with a !Ref tag
      if (yamlNode.tag === '!GetAtt') {
        yamlNode.references = [{
          referencedKey: yamlNode.value,
          // Add 7 because '!GetAtt ' is 7 and the range begins at the beginning of the field
          // Add 1 because... I still don't know why, see !Sub, similar issue.
          // Hey maybe it's counting the space between ':' and '!GetAtt' ?
          // I'm sure it has nothing to do with getRowColumnPosition's logic ^_^
          keyPositionInValue: 7 + 1,
        }];
        return [yamlNode];
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
          const position = this.getRowColumnPosition(fullText, node.range[0]);
          const range = new vscode.Range(
            position.line,
            // The column starts at the beginning of the value (including any tags)
            position.column + reference.keyPositionInValue,
            position.line,
            position.column + reference.keyPositionInValue + reference.referencedKey.length,
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

  private getSubNodesWhichReferenceLocalResources(yamlNode: Node): Node[] {
    if (yamlNode) {
      const keys = this.getYamlNodeKeys(yamlNode);
      if (keys.length > 0) {
        // This means the node is a map, not a node with a value which could contain a reference
        const referenceSubNodes = keys.map((key) => {
          return this.getSubNodesWhichReferenceLocalResources(yamlNode.get(key, true));
        });
        return flattenArray(referenceSubNodes);
      }

      // Handle nodes with a !Ref tag
      if (yamlNode.tag === '!Ref') {
        yamlNode.references = [{
          referencedKey: yamlNode.value,
          // Add 5 because '!Ref ' is 5 and the range begins at the beginning of the field
          keyPositionInValue: 5,
        }];
        return [yamlNode];
      }

      // Handle nodes with a !Sub tag
      if (yamlNode.tag === '!Sub') {
        // This will find ALL ${references} in the !Sub
        let match: RegExpExecArray;
        yamlNode.references = [];
        const regEx = new RegExp('\\${[^}]*}', 'g');
        while ((match = (regEx.exec(yamlNode.value as string) as RegExpExecArray)) != null) {
          const reference = {
            // Add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
            // Add 2 because we've trimmed off '${'
            // Add 1, I'm not really sure why. Maybe something about match.index starting at 0?
            keyPositionInValue: 5 + 2 + match.index + 1,
            // Trim the ${} off of the match
            referencedKey: match[0].substring(2, match[0].length - 1),
          };
          yamlNode.references.push(reference);
        }
        return [yamlNode];
      }
    }
    return [];
  }

  private getLocalReferenceables(document: any) {
    const parameters = document.get('Parameters');
    const resources = document.get('Resources');
    return this.getYamlNodeKeys(parameters).concat(this.getYamlNodeKeys(resources));
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
