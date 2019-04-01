import * as vscode from 'vscode';
import clone from 'lodash.clonedeep';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

import { createDiagnostic, createDiagnosticsFromSubStackNode, createDiagnosticsFromReferencingNode, addDiagnostic } from './common/Diagnostics';
import { getYamlNodeKeys, getNodeValueIfPair, getNodeItemByStringKey, EmptyNode } from './Yaml';
import { Node } from './Yaml/Node';
import { NodeTypes } from './Yaml/NodeTypes';
import { revealAllProperties } from './common';
import { getRowColumnPosition } from './common/RowColumnPosition';
import { References } from './Yaml/References';
import { NodeTraversal } from './Yaml/NodeTraversal';
import { SubStack } from './common/SubStack';

export const diagnosticCollectionName = 'CloudFormation Yaml Validator';

export class CloudformationYaml implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  public urisCurrentlyBeingProcessed: vscode.Uri[] = [];
  private subscriptions: vscode.Disposable[] = [];
  private allowEventTriggers: boolean = true;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection(diagnosticCollectionName);
  }

  // Used to make integration testing possible
  // LOTS of interference from events, and just `dispose`ing subscriptions doesn't seem to help
  public async eventTrigger() {
    // console.log(`Event triggered, allow: ${this.allowEventTriggers}`);
    if (this.allowEventTriggers) {
      await this.checkActiveFile(false, true);
    }
  }

  // Used in integration testing
  public async disableEventTriggers() {
    this.allowEventTriggers = false;
    for (const subscription of this.subscriptions) {
      if (subscription !== this) {
        await subscription.dispose();
      }
    }
  }

  // Used in integration testing
  public async resetDiagnostics() {
    await this.diagnosticCollection.clear();
  }

  // Required to implement vscode.Disposable
  public dispose() {
    if (this.diagnosticCollection) {
      this.diagnosticCollection.clear();
      this.diagnosticCollection.dispose();
    }
  }

  // The extension index calls this to enable the extension
  public activate(context: vscode.ExtensionContext) {
    this.diagnosticCollection = this.diagnosticCollection
      ? this.diagnosticCollection
      : vscode.languages.createDiagnosticCollection(diagnosticCollectionName);
    this.subscriptions = context.subscriptions;
    if (this.subscriptions.indexOf(this) < 0) {
      this.subscriptions.push(this);
    }
    this.allowEventTriggers = true;
    vscode.window.onDidChangeActiveTextEditor(this.eventTrigger, this, this.subscriptions);
    vscode.workspace.onDidOpenTextDocument(this.eventTrigger, this, this.subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.eventTrigger, this, this.subscriptions);
    vscode.workspace.onDidChangeTextDocument(this.eventTrigger, this, this.subscriptions);
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
    const isCurrentlyBeingProcessed = this.urisCurrentlyBeingProcessed.indexOf(documentUri) > -1;
    if (isCurrentlyBeingProcessed) {
      return [];
    }

    this.diagnosticCollection.delete(documentUri);
    try {
      this.urisCurrentlyBeingProcessed.push(documentUri);
      const fullTraversal = await this.traverse((document.contents as Node), fullText, filePath, documentUri, isRoot, recurse);
      this.buildDiagnostics(fullTraversal);
    } catch (error) {
      console.error(`${diagnosticCollectionName} encountered an error: ${JSON.stringify(revealAllProperties(error))}`);
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

  private async traverse(
    injectedNode: Node,
    fullText: string,
    filePath: string,
    documentUri: vscode.Uri,
    isRootNode: boolean,
    recurseSubStacks: boolean,
  ): Promise<NodeTraversal> {
    const node = getNodeValueIfPair(injectedNode);
    let resultantTraversal = clone(NodeTraversal.EMPTY_TRAVERSAL);
    resultantTraversal.fullText = fullText;
    resultantTraversal.documentUri = documentUri;

    if (!node || node === EmptyNode.EMPTY_NODE) {
      return resultantTraversal;
    }

    // if (isRootNode) {
    //   const resourcesNode = getNodeValueIfPair(getNodeItemByStringKey(node, 'Resources'));
    //   resultantTraversal.parameters = getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Parameters')));
    //   resultantTraversal.conditions = getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Conditions')));
    //   resultantTraversal.mappings = getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Mappings')));
    //   resultantTraversal.resources = getYamlNodeKeys(resourcesNode);
    //   const resourcesTraversal = await this.traverse(resourcesNode, fullText, filePath, documentUri, false, recurseSubStacks);
    //   const subTraversal = await this.traverse(resourcesNode, fullText, filePath, documentUri, false, recurseSubStacks);
    //   return NodeTraversal.flatten([resultantTraversal, subTraversal]);
    // }
    if (isRootNode) {
      resultantTraversal.localReferenceables = [
        ...getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Parameters'))),
        ...getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Conditions'))),
        ...getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Mappings'))),
        ...getYamlNodeKeys(getNodeValueIfPair(getNodeItemByStringKey(node, 'Resources'))),
      ];
    }

    // If this node is a sub stack, collect info about it
    if (node.get && node.get('Type') === 'AWS::CloudFormation::Stack') {
      const parentPath = `${filePath.substring(0, filePath.lastIndexOf(path.sep))}`;
      const newReferenceables = await this.getSubStackReferenceables(fullText, documentUri, node, parentPath, recurseSubStacks);
      resultantTraversal.subStackReferenceables = SubStack.flattenReferenceables([resultantTraversal.subStackReferenceables, newReferenceables]);
      resultantTraversal.nodesWhichReference.push(node);
    }

    // If it's a node which can contain references, note them
    if (node.type === NodeTypes.PLAIN || node.type === NodeTypes.QUOTE_DOUBLE || node.type === NodeTypes.QUOTE_SINGLE) {
      // Handle nodes without a tag, these are probably first members of an !If or !FindInMap
      const nodeTag = node.tag || node.stringKey;
      if (nodeTag === '!If' || nodeTag === '!FindInMap' || nodeTag === 'DependsOn') {
        resultantTraversal.nodesWhichReference = [
          ...resultantTraversal.nodesWhichReference,
          ...References.addToIfFindInMapDependsOn(node, nodeTag),
        ];
      }

      if (nodeTag === '!GetAtt') {
        resultantTraversal.nodesWhichReference = [
          ...resultantTraversal.nodesWhichReference,
          ...References.addToGetAtt(node),
        ];
      }

      if (nodeTag === '!Ref') {
        resultantTraversal.nodesWhichReference = [
          ...resultantTraversal.nodesWhichReference,
          ...References.addToRef(node),
        ];
      }

      if (nodeTag === '!Sub') {
        resultantTraversal.nodesWhichReference = [
          ...resultantTraversal.nodesWhichReference,
          ...References.addToSub(node),
        ];
      }
    }

    // If this is a map, we just need to go deeper.
    if (node.type === NodeTypes.MAP && node.items) {
      const traversalPromises = node.items.map((item) => {
        item.tag = !item.tag ? node.tag : item.tag;
        return this.traverse(item, fullText, filePath, documentUri, false, recurseSubStacks);
      });
      const traversals = await Promise.all(traversalPromises);
      resultantTraversal = NodeTraversal.flatten([resultantTraversal, ...traversals]);
    }

    // If it's an array, there are some edge cases to handle
    if (node.type === NodeTypes.FLOW_SEQ) {
      // Clone the array (we're going to modify it) and grab the first node.
      const items = clone(node.items);
      const firstSubNode = items.shift();
      if (firstSubNode) {
        // The first node is always (?) a reference to a Map or Conditional
        // But this first node has nothing to distinguish it as such, so propagate the parent node's tag to it
        if (node.items[0] && !node.items[0].tag) node.items[0].tag = node.tag;

        // Then, handle the nodes recursively
        const traversalPromises = node.items.map((item) => {
          return this.traverse(item, fullText, filePath, documentUri, false, recurseSubStacks);
        });
        const traversals = await Promise.all(traversalPromises);
        resultantTraversal = NodeTraversal.flatten([resultantTraversal, ...traversals]);
      }
    }
    return resultantTraversal;
  }

  private buildDiagnostics(traversal: NodeTraversal) {
    traversal.nodesWhichReference.forEach((node) => {
      // If the node creates a sub stack from template...
      if (node.get && node.get('Type') === 'AWS::CloudFormation::Stack') {
        createDiagnosticsFromSubStackNode(node, traversal, this.diagnosticCollection);
      } else {
        createDiagnosticsFromReferencingNode(node, traversal, this.diagnosticCollection);
      }
    });
  }

  private async getSubStackReferenceables(
    fullText: string,
    documentUri: vscode.Uri,
    subStackNode: Node,
    parentPath: string,
    recurse: boolean,
  ): Promise<SubStack.Referenceables> {
    const referenceableOutputs: string[] = [];
    const referenceableParameters: SubStack.ParameterReferenceablesMap = {};
    // const properties = (subStackNodePair.value as Node).get('Properties') as Node;
    const properties = subStackNode.get('Properties') as Node;
    const templateUrl = (properties as Node).get('TemplateURL');
    if (typeof templateUrl === 'string') {
      const filePath = `${parentPath}${path.sep}${templateUrl}`;
      try {
        referenceableParameters[templateUrl] = [];
        const fileText = fs.readFileSync(filePath, 'utf8');
        const document: any = YAML.parseDocument(fileText, { keepCstNodes: true });

        // Build the list of referenceable Outputs
        const outputs = document.contents.get('Outputs');
        const outputKeys = getYamlNodeKeys(outputs);
        outputKeys.forEach((key) => {
          referenceableOutputs.push(`${subStackNode.stringKey}.Outputs.${key}`);
        });

        // Build the list of referenceable parameters
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

        if (recurse) {
          // Gather information necessary to check the file
          const uriString = `file://${filePath}`;
          const documentUri = vscode.Uri.parse(uriString);
          const diagnostics = await this.checkYaml(fileText, documentUri, filePath, document, recurse, false);
          // If diagnostics for that file were generated, open it.
          if (diagnostics.length > 0) {
            const textDocument = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(textDocument);
          }
        }
      } catch (error) {
        // This error was almost certainly because the file couldn't be read or does not exist.
        const templateUrlNodePair = getNodeItemByStringKey(properties, 'TemplateURL');
        const templateUrlNodeValue = templateUrlNodePair.value as Node;
        const templateUrl = templateUrlNodeValue.value as string;
        const position = getRowColumnPosition(fullText, templateUrlNodeValue.range[0]);
        const diagnostic = createDiagnostic(
          position,
          templateUrl.length,
          vscode.DiagnosticSeverity.Error,
          `Unable to load or parse template file, '${filePath}'. Error encountered: ${JSON.stringify(revealAllProperties(error))}`,
        );
        addDiagnostic(documentUri, diagnostic, this.diagnosticCollection);
      }
    }
    return {
      outputs: referenceableOutputs,
      parameters: referenceableParameters,
    };
  }
}
