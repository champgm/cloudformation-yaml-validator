import fs from 'fs';
import * as vscode from 'vscode';

import YAML from 'yaml';
import get from 'lodash.get';
import clone from 'lodash.clonedeep';
import { revealAllProperties, flattenArray, getRowColumnPosition } from './util';
import { RowColumnPosition } from './common/interfaces';

interface Reference {
  type: ReferenceTypes;
  absoluteKeyPosition: number;
  referencedKey: string;
}

enum ReferenceTypes {
  REF = 'REF',
  SUB = 'SUB',
  GET_ATT = 'GET_ATT',
  IF = 'IF',
  DEPENDS_ON = 'DEPENDS',
  FIND_IN_MAP = 'FIND_IN_MAP',
}

enum NodeTypes {
  MAP = 'MAP',
  PAIR = 'PAIR',
  PLAIN = 'PLAIN',
  FLOW_SEQ = 'FLOW_SEQ',
  QUOTE_DOUBLE = 'QUOTE_DOUBLE',
  EMPTY = 'EMPTY',
}

type Node = YAML.ast.Node & {
  type: NodeTypes;
  key: Node;
  items: Node[];
  stringKey?: string;
  get: (key: string) => Node | string;
  value?: Node | string;
  range: number[];
  references: Reference[];
};

interface Node2 {
  type: NodeTypes;
  items: Node[];
  range: number[];
  references: Reference[];
  tag: string;
  has?: (key: string) => boolean;
  get: (key: string) => Node | string;
  value?: Node;
  stringKey?: string;
  // [key: string]: any;
}

interface Referenceables {
  conditions: string[];
  mappings: string[];
  parameters: string[];
  resources: string[];
  subStackReferenceables: SubStackReferenceables;
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
    vscode.window.onDidChangeActiveTextEditor(this.checkYaml, this, subscriptions);
    vscode.workspace.onDidOpenTextDocument(this.checkYaml, this, subscriptions);
    vscode.workspace.onDidCloseTextDocument((textDocument) => { this.diagnosticCollection.delete(textDocument.uri); }, null, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.checkYaml, this, subscriptions);
    vscode.workspace.onDidChangeTextDocument(this.checkYaml, this, subscriptions);
  }

  public checkYaml() {
    try {
      const editor: vscode.TextEditor = vscode.window.activeTextEditor as vscode.TextEditor;
      if (editor) {
        const documentUri = editor.document.uri;
        this.diagnosticCollection.delete(documentUri);
        const fullText = editor.document.getText();
        const document = YAML.parseDocument(fullText, { keepCstNodes: true });

        // Check all !Ref and !Sub tags
        const referenceables = this.getReferenceables(documentUri, editor);
        const nodesWhichReference = this.getNodesWhichReference(document);
        this.buildInvalidReferenceDiagnostics(fullText, documentUri, referenceables, nodesWhichReference);

        // Check parameters in sub stacks to make sure they can be referenced
        const subStackNodePairs = this.findSubStackNodePairs(document);
        this.buildInvalidSubStackParameterDiagnostics(fullText, documentUri, referenceables.subStackReferenceables, subStackNodePairs);
      }
    } catch (error) {
      console.error(`${diagnosticCollectionName} encountered an error: ${JSON.stringify(revealAllProperties(error), null, 2)}`);
      // vscode.window.showErrorMessage(`${diagnosticCollectionName}: ${error.message}`);
    }
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
    const nodeValue = this.getNodeValueIfPair(node);
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
    const subStackParameterDiagnostics: vscode.Diagnostic[] = [];
    subStackNodePairs.forEach((subStackNodePair) => {
      const subStackNodeValue = subStackNodePair.value;
      if (!subStackNodeValue || typeof subStackNodeValue === 'string') return;
      const properties = this.getNodeValueIfPair(this.getNodeItemByStringKey(subStackNodeValue, 'Properties'));

      // Get the template URL and matching parameters for the sub stack
      const templateUrl = properties.get('TemplateURL');
      if (typeof templateUrl === 'string') {
        const parameters = this.getNodeValueIfPair(this.getNodeItemByStringKey(properties, 'Parameters'));
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
            const diagnostic = this.createDiagnostic(
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
          const propertiesPair = this.getNodeItemByStringKey(properties, 'Parameters');
          if (!propertiesPair) return;
          const propertiesPosition = getRowColumnPosition(fullText, propertiesPair.key.range[0]);
          referenceableParameters.forEach((referenceableParameter) => {
            const message = referenceableParameter.hasDefault
              ? `Properties missing value for parameter with default value, '${referenceableParameter.parameterName}'`
              : `Properties missing value for required parameter, '${referenceableParameter.parameterName}'`;
            const severity = referenceableParameter.hasDefault
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Error;
            const diagnostic = this.createDiagnostic(propertiesPosition, 'Properties'.length, severity, message);
            this.addDiagnostic(documentUri, diagnostic);
          });
        }
      }
    });
  }

  private getSubStackReferenceables(
    fullText: string,
    documentUri: vscode.Uri,
    subStackNodePairs: Node[],
    parentPath: string,
  ): SubStackReferenceables {
    const referenceableOutputs: string[] = [];
    const referenceableParameters: SubStackParameterReferenceablesMap = {};
    subStackNodePairs.forEach((nodePair) => {
      const properties = (nodePair.value as Node).get('Properties') as Node;
      const templateUrl = (properties as Node).get('TemplateURL');
      if (typeof templateUrl === 'string') {
        referenceableParameters[templateUrl] = [];
        const filePath = `${parentPath}/${templateUrl}`;
        let document: any;
        try {
          const fileText = fs.readFileSync(filePath, 'utf8');
          document = YAML.parseDocument(fileText, { keepCstNodes: true });
        } catch (error) {
          const templateUrlNodePair = this.getNodeItemByStringKey(properties, 'TemplateURL');
          if (!templateUrlNodePair) return;
          const templateUrlNodeValue = templateUrlNodePair.value as Node;
          const templateUrl = templateUrlNodeValue.value as string;
          const position = getRowColumnPosition(fullText, templateUrlNodeValue.range[0]);
          const diagnostic = this.createDiagnostic(
            position,
            templateUrl.length,
            vscode.DiagnosticSeverity.Error,
            `Unable to load or parse template file, '${filePath}'. Error encountered: ${JSON.stringify(revealAllProperties(error), null, 2)}`,
          );
          this.addDiagnostic(documentUri, diagnostic);
          return;
        }
        const outputs = document.contents.get('Outputs');
        const outputKeys = this.getYamlNodeKeys(outputs);
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
    });
    return {
      outputs: referenceableOutputs,
      parameters: referenceableParameters,
    };
  }

  private createDiagnostic(position: RowColumnPosition, length: number, severity: vscode.DiagnosticSeverity, message: string) {
    const range = new vscode.Range(position.line, position.column, position.line, position.column + length);
    return new vscode.Diagnostic(range, message, severity);
  }

  public static referenceTypeToDiagnosticMessageMap: { [referenceType: string]: (key: string) => string } = {
    [ReferenceTypes.DEPENDS_ON]: key => `Unable to find referenced resource, '${key}'`,
    [ReferenceTypes.FIND_IN_MAP]: key => `Unable to find referenced map, '${key}'`,
    [ReferenceTypes.GET_ATT]: key => `Unable to find referenced sub stack output, '${key}'`,
    [ReferenceTypes.IF]: key => `Unable to find referenced condition, '${key}'`,
    [ReferenceTypes.REF]: key => `Unable to find referenced value, '${key}'`,
    [ReferenceTypes.SUB]: key => `Unable to find referenced value, '${key}'`,
  };
  private buildInvalidReferenceDiagnostics(
    fullText: string,
    documentUri: vscode.Uri,
    referenceables: Referenceables,
    nodesWhichReference: Node[],
  ): void {
    const invalidReferences: vscode.Diagnostic[] = [];
    const localReferenceables = referenceables.conditions
      .concat(referenceables.mappings)
      .concat(referenceables.parameters)
      .concat(referenceables.resources);
    nodesWhichReference.forEach((node) => {
      node.references.forEach((reference) => {
        const position = getRowColumnPosition(fullText, reference.absoluteKeyPosition);
        const message = CloudformationYaml.referenceTypeToDiagnosticMessageMap[reference.type](reference.referencedKey);
        const diagnostic = this.createDiagnostic(position, reference.referencedKey.length, vscode.DiagnosticSeverity.Error, message);

        // If it's a !GetAtt reference, check the sub-stack outputs and no other referenceables
        if (reference.type === ReferenceTypes.GET_ATT) {
          if (referenceables.subStackReferenceables.outputs.indexOf(reference.referencedKey) < 0) {
            this.addDiagnostic(documentUri, diagnostic);
          }
          return;
        }

        // Otherwise, check local referenceables
        if (localReferenceables.indexOf(reference.referencedKey) < 0) {
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

  public static nodeTagToReferenceTypeMap = {
    '!If': ReferenceTypes.IF,
    '!FindInMap': ReferenceTypes.FIND_IN_MAP,
    DependsOn: ReferenceTypes.DEPENDS_ON,
  };
  private getSubNodesWhichReference(node: Node): Node[] {
    if (!node) return [];
    const nodeValue = this.getNodeValueIfPair(node);
    // If this is an array or map, we need to go deeper.
    if ((nodeValue.type === NodeTypes.FLOW_SEQ || nodeValue.type === NodeTypes.MAP) && nodeValue.items) {
      const subNodes = nodeValue.items.map((item) => {
        if (!item.tag) {
          item.tag = nodeValue.tag;
        }
        return this.getSubNodesWhichReference(item);
      });
      return flattenArray(subNodes);
    }

    // Otherwise, we need to inspect the node
    if (nodeValue.type === NodeTypes.PLAIN || nodeValue.type === NodeTypes.QUOTE_DOUBLE) {
      // Handle nodes without a tag, these are probably first members of an !If or !FindInMap
      const nodeTag = nodeValue.tag || nodeValue.stringKey;
      if (nodeTag === '!If' || nodeTag === '!FindInMap' || nodeTag === 'DependsOn') {
        nodeValue.references = [{
          type: CloudformationYaml.nodeTagToReferenceTypeMap[nodeTag],
          referencedKey: nodeValue.value as string,
          absoluteKeyPosition: nodeValue.range[0],
        }];
        return [nodeValue];
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
          const reference = {
            referencedKey,
            type: ReferenceTypes.SUB,
            // Add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
            // Add 2 because we've trimmed off '${'
            // Add 1 because !Sub values always start with "
            absoluteKeyPosition: nodeValue.range[0] + 5 + 1 + 2 + match.index,
          };
          nodeValue.references.push(reference);
        }
        return [nodeValue];
      }
    }
    return [];
  }

  public static readonly EMPTY_NODE: Node = {
    type: NodeTypes.EMPTY,
    items: [],
    references: [],
    range: [0, 0],
    tag: '',
    get: () => { return CloudformationYaml.EMPTY_NODE; },
    comment: '',
    commentBefore: '',
    toJSON: () => { return '{}'; },
    key: CloudformationYaml.EMPTY_NODE,
  };
  private getNodeValueIfPair(node: Node): Node {
    if (!node || node.type === NodeTypes.EMPTY) return CloudformationYaml.EMPTY_NODE;
    const nodeValue = (node.type === NodeTypes.PAIR ? get(node, 'value') : node) as Node;
    nodeValue.stringKey = nodeValue.stringKey ? nodeValue.stringKey : node.stringKey;
    return nodeValue;
  }

  private getNodeItemByStringKey(node: Node, stringKey: string): Node {
    const item = node.items.find((nodePair: Node) => {
      return nodePair.stringKey === stringKey;
    });
    return item ? item : CloudformationYaml.EMPTY_NODE;
  }

  private getReferenceables(documentUri: vscode.Uri, editor: any): Referenceables {
    const fullText = editor.document.getText();
    const document = YAML.parseDocument(fullText, { keepCstNodes: true });

    // Get local referenceables, these are just keys of various top-level sections
    if (document.contents) {
      const contents = document.contents as Node;
      const parameters = contents.get('Parameters');
      const resources = contents.get('Resources');
      const conditions = contents.get('Conditions');
      const mappings = contents.get('Mappings');

      // Find sub stack referenceables, this will require work.
      const subStackNodePairs = this.findSubStackNodePairs(document);
      const rootFilePath = editor.document.fileName;
      const parentPath = `${rootFilePath.substring(0, rootFilePath.lastIndexOf('/'))}`;
      const subStackReferenceables = this.getSubStackReferenceables(fullText, documentUri, subStackNodePairs, parentPath);

      return {
        subStackReferenceables,
        parameters: this.getYamlNodeKeys(parameters),
        resources: this.getYamlNodeKeys(resources),
        mappings: this.getYamlNodeKeys(mappings),
        conditions: this.getYamlNodeKeys(conditions),
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
