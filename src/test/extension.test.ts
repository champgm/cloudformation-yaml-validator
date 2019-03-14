//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import vscode from 'vscode';
import path from 'path';
import { diagnosticCollectionName } from '../CloudformationYaml';

// as well as import your extension to test it
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite('Extension Integration Tests', () => {
  const backToProjectDirectory = '../..';

  test('Finds no diagnostics given valid yaml files', async () => {
    const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/src/test/resources/valid_yaml/test.yml`));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    await diagnosticsChange();
    console.log(`DIAGNOSTICS ${JSON.stringify(vscode.languages.getDiagnostics())}`);

    // TODO: figure out how to assert no diagnostics...
  });

  test('Finds diagnostics given invalid yaml files', async () => {
    const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/src/test/resources/invalid_yaml/test.yml`));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    await diagnosticsChange();
    console.log(`DIAGNOSTICS ${JSON.stringify(vscode.languages.getDiagnostics())}`);

    // TODO: figure out how to assert no diagnostics...
  });
});

function diagnosticsChange(): Promise<vscode.DiagnosticChangeEvent> {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    vscode.languages.onDidChangeDiagnostics((event) => {
      resolved = true;
      resolve(event);
    });
    await sleep(20000);
    if (!resolved) {
      reject('Diagnostic wait timed out');
    }
  });
}

export async function sleep(milliseconds?: number) {
  const time = milliseconds ? milliseconds : 100;
  await new Promise(resolve => setTimeout(resolve, time));
}