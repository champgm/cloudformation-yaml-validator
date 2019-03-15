//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import vscode, { Uri, Diagnostic } from 'vscode';
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
    const diagnostics = await getDiagnostics(uri);
    assert.deepEqual(diagnostics.length, 0, 'Diagnostics array should be empty');
  });

  test('Finds diagnostics given invalid yaml files', async () => {
    const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/src/test/resources/invalid_yaml/test.yml`));
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const diagnostics = await getDiagnostics(uri);
    console.log(`DIAGNOSTCS: ${JSON.stringify(diagnostics)}`);
    assert.deepEqual(diagnostics.length, 5, 'Diagnostics array should be empty');
  });
});

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