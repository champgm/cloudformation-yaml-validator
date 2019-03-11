
import * as vscode from 'vscode';

// import { safeLoad } from 'js-yaml';
import YAML from 'yaml';
// import schema from 'cloudformation-schema-js-yaml';
import get from 'lodash.get';
import { revealAllProperties, flattenArray } from './util';
// import JSON from 'flatted';

export class CloudformationYaml implements vscode.CodeActionProvider {

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
    subscriptions.push(this);
    vscode.workspace.onDidOpenTextDocument(this.go, this, subscriptions);
    vscode.workspace.onDidCloseTextDocument((textDocument) => { this.diagnosticCollection.delete(textDocument.uri); }, null, subscriptions);
    vscode.workspace.onDidSaveTextDocument(this.go, this, subscriptions);
    vscode.workspace.onDidChangeTextDocument(this.go, this, subscriptions);
    vscode.workspace.onDidChangeConfiguration(this.go, this);
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    return null;
  }

  go() {
    const editor: vscode.TextEditor = vscode.window.activeTextEditor as vscode.TextEditor;

    const text = editor.document.getText();
    console.log(`GOT TEXT:`);
    console.log(`${JSON.stringify(text, null, 2)}`);

    // const yamlObject = safeLoad(text, { schema });
    const document = YAML.parseDocument(text, { keepCstNodes: true });

    const yamlObject = (document as any).contents;
    console.log(`yamlObject: ${JSON.stringify(yamlObject)}`);
    console.log(`GOT YAML:`);
    console.log(`${JSON.stringify(yamlObject, null, 2)}`);

    const rootFilePath = editor.document.fileName;
    console.log(`GOT FILE PATH: ${rootFilePath}`);

    const parentPath = `${rootFilePath.substring(0, rootFilePath.lastIndexOf('/'))}/`;
    console.log(`GOT PARENT DIRECTORY PATH: ${parentPath}`);

    // const referenceableKeys = Object.keys(yamlObject.Resources).concat(Object.keys(yamlObject.Parameters));
    const referenceableKeys = this.getReferenceables(document);
    console.log(`GOT REFERENCEABLE KEYS ${JSON.stringify(referenceableKeys, null, 2)}`);

    const referencingNodes = this.getNodesWhichReference(document);
    console.log(`GOT REFERENCING NODES: ${JSON.stringify(referencingNodes, null, 2)}`);

    const refKeys = [];//this.findKeys('Ref', yamlObject);
    console.log(`GOT REF KEYS: ${JSON.stringify(refKeys, null, 2)}`);

    const refErrors = refKeys.filter((key) => {
      const value = get(yamlObject, key);
      return referenceableKeys.indexOf(value) < 0;
    });
    console.log(`GOT REF ERRORS: ${JSON.stringify(refErrors, null, 2)}`);

    const invalidReferences = this.getInvalidReferences(yamlObject, refErrors, referenceableKeys);
    console.log(`splitting by lines...`);
    const textSplitByLines = this.splitByLines(text);
    const diagnostics: vscode.Diagnostic[] = [];
    console.log(`Gathering diagnostics...`);
    invalidReferences.forEach((phrase) => {
      for (let index = 0; index < textSplitByLines.length; index += 1) {
        const line = textSplitByLines[index];
        if (line.indexOf(phrase) > -1) {
          console.log(`Searching line for phrase ${phrase}`);
          const range = new vscode.Range(index, line.lastIndexOf(phrase), index, line.lastIndexOf(phrase) + phrase.length);
          diagnostics.push(
            new vscode.Diagnostic(
              range,
              `Unable to find reference variable`,
              vscode.DiagnosticSeverity.Error,
            ));
        }
      }
    });
    console.log(`GOt ${diagnostics.length} diagnostics`);
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('Cloudformation Yaml Checker');
    console.log(`setting diagnostics...`);
    this.diagnosticCollection.set(editor.document.uri, diagnostics);
  }

  public splitByLines(text: string): string[] {
    return text.split(/\r?\n/);
  }

  public getNodesWhichReference(document: any) {
    const resources = document.get('Resources');
    const outputs = document.get('Outputs');
    return this.getReferenceNodes(resources).concat(this.getReferenceNodes(outputs));
  }

  public getReferenceNodes(yamlNode: any): any[] {
    if (yamlNode) {
      const keys = this.getKeys(yamlNode);
      if (keys.length > 0) {
        const referenceSubNodes = keys.map((key) => {
          return this.getReferenceNodes(yamlNode.get(key, true));
        });
        return flattenArray(referenceSubNodes);
      }

      if (yamlNode.tag === '!Ref' || yamlNode.tag === '!Sub') {
        return [yamlNode];
      }
    }
    return [];
  }

  public getReferenceables(document: any) {
    const parameters = document.get('Parameters');
    const resources = document.get('Resources');
    return this.getKeys(parameters).concat(this.getKeys(resources));
  }

  public getKeys(yamlNode: any): string[] {
    if (yamlNode.items) {
      return yamlNode.items.map((itemNode) => {
        return itemNode.stringKey;
      });
    }
    return [];
  }

  public getInvalidReferences(
    yamlObject: any,
    fullReferenceKeyPaths: string[],
    referenceableKeys: string[])
    : string[] {
    const invalidReferences: string[] = [];
    fullReferenceKeyPaths.forEach((keyPath) => {
      const value = get(yamlObject, keyPath);
      if (referenceableKeys.indexOf(value) < 0) {
        if (invalidReferences.indexOf(value) < 0) {
          invalidReferences.push(value);
        }
      }
    });
    return invalidReferences;
  }

  // public getErrorPhrases(fullKeyPaths: string[]): { [key: string]: boolean } {
  //   const errorPhrases: { [key: string]: boolean } = {};
  //   fullKeyPaths.forEach((keyPath) => {
  //     console.log(`Splitting key path: ${keyPath}`);
  //     const pathPieces = keyPath.split('.');
  //     const errorPhrase = `!${pathPieces[pathPieces.length - 1]} ${pathPieces[pathPieces.length - 2]}`
  //     console.log(`errorPhrase: ${errorPhrase}`);
  //     errorPhrases[errorPhrase] = true;
  //   });
  //   return errorPhrases;
  // }

  public findKeys(keyName: string, object: any, keyPrefix?: string): string[] {
    if (object === undefined || object === null) {
      return [];
    }
    const keys = Object.keys(object);
    let matchingKeys: string[] = [];
    keys.forEach((key) => {
      const currentFullKey = keyPrefix ? `${keyPrefix}.${key}` : key;
      const currentObject = object[key];
      if (key === keyName) {
        matchingKeys.push(currentFullKey);
      } else if (typeof currentObject === 'object' && currentObject !== null) {
        matchingKeys = matchingKeys.concat(this.findKeys(keyName, currentObject, currentFullKey));
      }
    });
    return matchingKeys;
  }

  public dispose() {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }
}
