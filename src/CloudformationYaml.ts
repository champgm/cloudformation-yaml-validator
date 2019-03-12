
import * as vscode from 'vscode';

// import { safeLoad } from 'js-yaml';
import YAML from 'yaml';
// import schema from 'cloudformation-schema-js-yaml';
import get from 'lodash.get';
import { revealAllProperties, flattenArray } from './util';
// import JSON from 'flatted';

interface Reference {
  referencedKey: string;
  keyPositionInValue: number;
}

interface Node {
  references: Reference[];
  [key: string]: any;
}

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
    const document = YAML.parseDocument(text, { keepCstNodes: true });
    const yamlObject = (document as any).contents;
    const rootFilePath = editor.document.fileName;
    const parentPath = `${rootFilePath.substring(0, rootFilePath.lastIndexOf('/'))}/`;
    const referenceableKeys = this.getReferenceables(document);
    const referencingNodes = this.getNodesWhichReference(document);

    const invalidReferenceDiagnostics = this.buildInvalidReferenceDiagnostics(text, referenceableKeys, referencingNodes);
    this.diagnosticCollection.clear();
    this.diagnosticCollection.set(editor.document.uri, invalidReferenceDiagnostics);
    console.log(`done`);

    // const range = new vscode.Range(index, line.lastIndexOf(phrase), index, line.lastIndexOf(phrase) + phrase.length);
    // diagnostics.push(
    //   new vscode.Diagnostic(
    //     range,
    //     `Unable to find reference variable`,
    //     vscode.DiagnosticSeverity.Error,
    //   ));
    // console.log(`GOt ${diagnostics.length} diagnostics`);
    // this.diagnosticCollection = vscode.languages.createDiagnosticCollection('Cloudformation Yaml Checker');
    // console.log(`setting diagnostics...`);
  }

  public splitByLines(text: string): string[] {
    return text.split(/\r?\n/);
  }

  public buildInvalidReferenceDiagnostics(
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
            position.column + reference.keyPositionInValue,
            position.line,
            position.column + reference.keyPositionInValue + reference.referencedKey.length,
          );
          const diagnostic = new vscode.Diagnostic(
            range,
            `Unable to find referenced variable, '${reference.referencedKey}'`,
            vscode.DiagnosticSeverity.Error,
          );
          invalidReferences.push(diagnostic);
        }
      });
    });
    return invalidReferences;
  }

  public getRowColumnPosition(text: string, absolutePosition: number): { line: number, column: number } {
    // YAML library doesn't have a line + column position, only absolute
    // So we have to count the lines.
    const textBefore = text.substring(0, absolutePosition);

    let match;
    let matches: RegExpExecArray[] = [];
    const regEx = new RegExp('\r?\n', 'g');
    while ((match = (regEx.exec(textBefore) as RegExpExecArray)) != null) {
      matches.push(match);
    }
    // Matches will contain each match on line return
    // the number of matches is the number of lines in the file
    const line = matches.length;

    // The last line return in textBefore is the one before our absolute position
    const lastLineReturn = matches[matches.length - 1];
    const afterLastLineReturn = lastLineReturn.index + lastLineReturn[0].length;

    // So, absolute - lastReturn should give us the column number for our absolute position
    const column = absolutePosition - afterLastLineReturn;
    return { column, line };
  }


  public getNodesWhichReference(document: any) {
    const resources = document.get('Resources');
    const outputs = document.get('Outputs');
    return this.getReferenceNodes(resources).concat(this.getReferenceNodes(outputs));
  }

  public getReferenceNodes(yamlNode: Node): Node[] {
    if (yamlNode) {
      const keys = this.getKeys(yamlNode);
      if (keys.length > 0) {
        const referenceSubNodes = keys.map((key) => {
          return this.getReferenceNodes(yamlNode.get(key, true));
        });
        return flattenArray(referenceSubNodes);
      }

      if (yamlNode.tag === '!Ref') {
        yamlNode.references = [{
          referencedKey: yamlNode.value,
          // Add 5 because '!Ref ' is 5 and the range begins at the beginning of the field
          keyPositionInValue: 5,
        }];
        return [yamlNode];
      }
      if (yamlNode.tag === '!Sub') {
        // Need to find ALL references in the !Sub

        let match: RegExpExecArray;
        yamlNode.references = [];
        const regEx = new RegExp('\\${[^}]*}', 'g');
        while ((match = (regEx.exec(yamlNode.value as string) as RegExpExecArray)) != null) {
          const reference = {
            referencedKey: match[0].substring(2, match[0].length - 1),
            // Add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
            // Add 2 because we've trimmed off '${'
            // Add 1, I'm not really sure why. Maybe something about match.index starting at 0?
            keyPositionInValue: 5 + 2 + match.index + 1,
          };
          yamlNode.references.push(reference);
        }
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

  // public getInvalidReferences(
  //   yamlObject: any,
  //   fullReferenceKeyPaths: string[],
  //   referenceableKeys: string[])
  //   : string[] {
  //   const invalidReferences: string[] = [];
  //   fullReferenceKeyPaths.forEach((keyPath) => {
  //     const value = get(yamlObject, keyPath);
  //     if (referenceableKeys.indexOf(value) < 0) {
  //       if (invalidReferences.indexOf(value) < 0) {
  //         invalidReferences.push(value);
  //       }
  //     }
  //   });
  //   return invalidReferences;
  // }

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

  // public findKeys(keyName: string, object: any, keyPrefix?: string): string[] {
  //   if (object === undefined || object === null) {
  //     return [];
  //   }
  //   const keys = Object.keys(object);
  //   let matchingKeys: string[] = [];
  //   keys.forEach((key) => {
  //     const currentFullKey = keyPrefix ? `${keyPrefix}.${key}` : key;
  //     const currentObject = object[key];
  //     if (key === keyName) {
  //       matchingKeys.push(currentFullKey);
  //     } else if (typeof currentObject === 'object' && currentObject !== null) {
  //       matchingKeys = matchingKeys.concat(this.findKeys(keyName, currentObject, currentFullKey));
  //     }
  //   });
  //   return matchingKeys;
  // }

  public dispose() {
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }
}
