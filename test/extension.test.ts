//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import vscode, { Uri, Diagnostic } from 'vscode';
import path from 'path';
import { diagnosticCollectionName } from '../src/CloudformationYaml';

// as well as import your extension to test it
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite('Extension Integration Tests', () => {
  const backToProjectDirectory = '../..';

  test('Finds no diagnostics given valid yaml files', async () => {
    const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/test/resources/valid_yaml/test.yml`));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await checkDiagnosticsUntilExpectedLength(uri, 0, 5000);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    assert.deepEqual(diagnostics.length, 0, `Diagnostics array should be empty: ${JSON.stringify(diagnostics)}`);
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('Finds diagnostics given invalid yaml files', async () => {
    const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/test/resources/invalid_yaml/test.yml`));
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
    await checkDiagnosticsUntilExpectedLength(uri, 11, 5000);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    assert.deepEqual(diagnostics.length, 11, `Diagnostics array should have 12 items: ${JSON.stringify(diagnostics)}`);
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});

async function checkDiagnosticsUntilExpectedLength(uri: vscode.Uri, expectedLength: number, timeout: number) {
  let totalTime = 0;
  while (totalTime < timeout) {
    console.log(`Getting diagnostics for URI: ${JSON.stringify(uri)}`);
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length === expectedLength) {
      return;
    }
    console.log(`Diagnostics length, '${diagnostics.length}', did not equal expected length, '${expectedLength}', trying again...`);
    totalTime += 200;
    await sleep(200);
  }
}

function returnError(mightThrow: () => void) {
  try {
    mightThrow();
  } catch (error) {
    return error;
  }
}

function getDiagnostics(uri: Uri): Promise<Diagnostic[]> {
  return new Promise(async (resolve, reject) => {
    let resolved = false;
    vscode.languages.onDidChangeDiagnostics((event) => {
      const uriDiagnostics = vscode.languages.getDiagnostics(uri);
      resolved = true;
      resolve(uriDiagnostics);
    });
    await sleep(10000);
    if (!resolved) {
      reject('Diagnostic wait timed out');
    }
  });
}

export async function sleep(milliseconds?: number) {
  const time = milliseconds ? milliseconds : 100;
  await new Promise(resolve => setTimeout(resolve, time));
}