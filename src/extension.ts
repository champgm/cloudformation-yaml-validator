// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { safeLoad } from 'js-yaml';
import schema from 'cloudformation-schema-js-yaml';
import { revealAllProperties } from './util';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "cloudformation-yaml-validator" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
    try {
      // The code you place here will be executed every time your command is executed

      // Display a message box to the user
      vscode.window.showInformationMessage('Hello World!');
      console.log(`BOX TRIGGERED`);

      const editor: vscode.TextEditor = vscode.window.activeTextEditor as vscode.TextEditor;
      console.log(`GOT TEXT:`);
      console.log(`${JSON.stringify(editor.document.getText(), null, 2)}`);

      const yamlObject = safeLoad(editor.document.getText(), { schema });
      console.log(`GOT YAML:`);
      console.log(`${JSON.stringify(yamlObject, null, 2)}`);

      const rootFilePath = editor.document.fileName;
      console.log(`GOT FILE PATH: ${rootFilePath}`);
      const parentPath = `${rootFilePath.substring(0, rootFilePath.lastIndexOf('/'))}/`;
      console.log(`GOT PARENT DIRECTORY PATH: ${parentPath}`);



    } catch (error) {
      console.log(`GOT ERROR:`);
      console.log(`${JSON.stringify(revealAllProperties(error), null, 2)}`);
      vscode.window.showErrorMessage(`That didn\'t work, sorry: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);
}

export function findKeys(keyName: string, object: any): string[] {
  if (object === undefined || object === null) {
    return [];
  }
  const keys = Object.keys(object);
  keys.forEach((key) => {
    
  });
}

// this method is called when your extension is deactivated
export function deactivate() { }
