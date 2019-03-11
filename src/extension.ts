// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { safeLoad } from 'js-yaml';
import schema from 'cloudformation-schema-js-yaml';
import get from 'lodash.get';

import { revealAllProperties } from './util';

let diagnosticCollection: vscode.DiagnosticCollection;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "cloudformation-yaml-validator" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
    try {
      // The code you place here will be executed every time your command is executed

      // Display a message box to the user
      vscode.window.showInformationMessage('Hello World!');
      console.log(`BOX TRIGGERED`);

      const editor: vscode.TextEditor = vscode.window.activeTextEditor as vscode.TextEditor;
      console.log(`GOT TEXT:`);
      const text = editor.document.getText();
      console.log(`${JSON.stringify(text, null, 2)}`);

      const yamlObject = safeLoad(text, { schema });
      console.log(`GOT YAML:`);
      console.log(`${JSON.stringify(yamlObject, null, 2)}`);

      const rootFilePath = editor.document.fileName;
      console.log(`GOT FILE PATH: ${rootFilePath}`);
      const parentPath = `${rootFilePath.substring(0, rootFilePath.lastIndexOf('/'))}/`;
      console.log(`GOT PARENT DIRECTORY PATH: ${parentPath}`);

      const refKeys = findKeys('Ref', yamlObject);
      console.log(`GOT REF KEYS: ${JSON.stringify(refKeys, null, 2)}`);

      // const refValues = refKeys.map((key) => {
      //   return get(yamlObject, key);
      // });
      // console.log(`GOT REF VALUES: ${JSON.stringify(refValues, null, 2)}`);

      const reffableKeys = Object.keys(yamlObject.Resources).concat(Object.keys(yamlObject.Parameters));
      console.log(`GOT REFFABLE KEYS${JSON.stringify(reffableKeys, null, 2)}`);

      const refErrors = refKeys.filter((key) => {
        const value = get(yamlObject, key);
        return reffableKeys.indexOf(value) < 0;
      });
      console.log(`GOT REF ERRORS: ${JSON.stringify(refErrors, null, 2)}`);


      // Examples from spellcheck extensiont
      // let lineRange = new vscode.Range( linenumber, colnumber, linenumber, colnumber + token.length );
      // let diag = new vscode.Diagnostic( lineRange, this.problemCollection[ token ], vscode.DiagnosticSeverity.Error );
      const errorPhrases = getErrorPhrases(refErrors);
      console.log(`splitting by lines...`);
      const textSplitByLines = splitByLines(text);
      const diagnostics: vscode.Diagnostic[] = [];
      console.log(`Gathering diagnostics...`);
      errorPhrases.forEach((phrase) => {
        for (let index = 0; index < textSplitByLines.length; index += 1) {
          const line = textSplitByLines[index];
          if (line.indexOf(phrase) > -1) {
            console.log(`Searching line for phrase ${phrase}`);
            const range = new vscode.Range(index, line.indexOf(phrase), index, line.indexOf(phrase) + phrase.length);
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
      diagnosticCollection = vscode.languages.createDiagnosticCollection('Cloudformation Yaml Checker');
      console.log(`setting diagnostics...`);
      diagnosticCollection.set(editor.document.uri, diagnostics);

    } catch (error) {
      console.log(`GOT ERROR:`);
      console.log(`${JSON.stringify(revealAllProperties(error), null, 2)}`);
      vscode.window.showErrorMessage(`That didn\'t work, sorry: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);
}

export function splitByLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function getErrorPhrases(fullKeyPaths: string[]): string[] {
  const errorPhrases: string[] = [];
  fullKeyPaths.forEach((keyPath) => {
    console.log(`Splitting keypath: ${keyPath}`);
    const pathPieces = keyPath.split('.');
    const errorPhrase = `!${pathPieces[pathPieces.length - 1]} ${pathPieces[pathPieces.length - 2]}`
    console.log(`errorPhrase: ${errorPhrase}`);
    errorPhrases.push(errorPhrase);
  });
  return errorPhrases;
}

export function findKeys(keyName: string, object: any, keyPrefix?: string): string[] {
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
      matchingKeys = matchingKeys.concat(findKeys(keyName, currentObject, currentFullKey));
    }
  });
  return matchingKeys;
}

// this method is called when your extension is deactivated
export function deactivate() {
  diagnosticCollection.clear();
  diagnosticCollection.dispose();
}
