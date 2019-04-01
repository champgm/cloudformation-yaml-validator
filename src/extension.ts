// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { CloudformationYaml } from './CloudformationYaml';

export const cloudformationYaml: CloudformationYaml = new CloudformationYaml();

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  cloudformationYaml.activate(context);
  cloudformationYaml.eventTrigger();
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const validatorCommandDisposable = vscode.commands.registerCommand('extension.cloudFormationYamlValidator', async () => {
    await cloudformationYaml.checkActiveFile(false, true);
  });
  context.subscriptions.push(validatorCommandDisposable);
  const recursiveCommandDisposable = vscode.commands.registerCommand('extension.cloudFormationYamlValidatorRecursive', async () => {
    await cloudformationYaml.checkActiveFile(true, true);
  });
  context.subscriptions.push(recursiveCommandDisposable);

  // Ok let's try to provide definition jumps
  // const selector: vscode.DocumentSelector = { language: 'yaml' };
  // const definitionProviderDisposable = vscode.languages.registerDefinitionProvider(selector);
  // context.subscriptions.push(definitionProviderDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (cloudformationYaml) {
    cloudformationYaml.dispose();
  }
}
