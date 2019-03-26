import mocha from 'mocha';
const describe = (mocha as any).describe;
const beforeEach = (mocha as any).beforeEach;
const it = (mocha as any).it;

import * as assert from 'assert';
import vscode, { Uri, Diagnostic } from 'vscode';
import path from 'path';

import { cloudformationYaml } from '../src/extension';

describe('Extension Integration Tests', () => {
  console.log(`Running Extension Integration Tests`);
  const backToProjectDirectory = '../..';

  describe('Valid YAML files', () => {
    it('Finds no diagnostics given valid yaml files', async () => {
      const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/test/resources/valid_yaml/test.yml`));
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      const diagnostics = vscode.languages.getDiagnostics(uri);
      assert.deepEqual(diagnostics.length, 0, `Diagnostics array should be empty: ${JSON.stringify(diagnostics)}`);
      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  describe('Invalid YAML files', () => {
    it('Finds diagnostics given invalid yaml files', async () => {
      const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/test/resources/invalid_yaml/test.yml`));
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      const diagnostics = vscode.languages.getDiagnostics(uri);

      const expectedMessages = [
        'Properties missing value for parameter with default value, \'FourthParameter\'',
        'Properties missing value for required parameter, \'FifthParameter\'',
        'Referenced file does not have parameter, \'SecondParameter\'',
        'Unable to find referenced condition, \'FirstConditional\'',
        'Unable to find referenced map, \'FirstMap\'',
        'Unable to find referenced resource, \'NonexistentSubstack\'',
        'Unable to find referenced sub stack output, \'FirstSubStack.Outputs.SecondOutput\'',
        'Unable to find referenced value, \'FirstParameter\'',
        'Unable to find referenced value, \'FourthParameter\'',
        'Unable to find referenced value, \'NonexistentSubstack\'',
        'Unable to find referenced value, \'RefStack\'',
        'Unable to find referenced value, \'SecondParameter\'',
        'Unable to find referenced value, \'SingleQuoteStack\'',
        'Unable to load or parse template file',
      ];

      expectedMessages.forEach((message) => {
        findAndRemoveDiagnosticByMessage(message, diagnostics);
      });
      const remainingDiagnostics = diagnostics.map((diagnostic) => {
        return diagnostic.message;
      });
      assert.deepEqual(0, diagnostics.length, `There should be no remaining diagnostics. Remaining diagnostics: ${JSON.stringify(remainingDiagnostics, null, 2)}`);
      vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });
});

function findAndRemoveDiagnosticByMessage(message: string, diagnostics: vscode.Diagnostic[]) {
  const expectedDiagnostic = diagnostics.find((diagnostic) => {
    return diagnostic.message.indexOf(message) > -1;
  });
  if (!expectedDiagnostic) {
    assert.fail(`Expected to find diagnostic with message containing: ${message}`);
  } else {
    diagnostics.splice(diagnostics.indexOf(expectedDiagnostic), 1);
  }
}

export async function sleep(milliseconds?: number) {
  const time = milliseconds ? milliseconds : 100;
  await new Promise(resolve => setTimeout(resolve, time));
}
