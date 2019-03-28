import mocha from 'mocha';
const describe = (mocha as any).describe;
const beforeEach = (mocha as any).beforeEach;
const afterEach = (mocha as any).beforeEach;
const it = (mocha as any).it;

import * as assert from 'assert';
import vscode from 'vscode';
import path from 'path';

import { cloudformationYaml } from '../src/extension';

describe('Extension Integration Tests', () => {
  console.log(`Running Extension Integration Tests`);
  const backToProjectDirectory = '../..';
  beforeEach(async () => {
    await cloudformationYaml.deactivate();
    await cloudformationYaml.reset();
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
  afterEach(async () => {
    await cloudformationYaml.deactivate();
    await cloudformationYaml.reset();
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  describe('Valid YAML files', () => {
    it('Finds no diagnostics given valid yaml files', async () => {
      const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/test/resources/valid_yaml/test.yml`));
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      await cloudformationYaml.checkSingleYaml();
      const diagnostics = vscode.languages.getDiagnostics(uri);
      assert.deepEqual(diagnostics.length, 0, `Diagnostics array should be empty: ${JSON.stringify(diagnostics)}`);
    });
  });

  describe('Invalid YAML files', () => {
    it('Finds diagnostics given invalid yaml files', async () => {
      const uri = vscode.Uri.file(path.join(`${__dirname}/${backToProjectDirectory}/test/resources/invalid_yaml/test.yml`));
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      await cloudformationYaml.checkSingleYaml();

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
        'Unable to find referenced value, \'SubInJoin\'',
        'Unable to find referenced value, \'RefInJoin\'',
        'Unable to load or parse template file',
      ];

      const diagnostics = vscode.languages.getDiagnostics(uri);
      expectedMessages.forEach((message) => {
        findAndRemoveDiagnosticByMessage(message, diagnostics);
      });
      const remainingDiagnostics = diagnostics.map((diagnostic) => {
        return diagnostic.message;
      });
      assert.deepEqual(0, diagnostics.length, `There should be no remaining diagnostics. Remaining diagnostics: ${JSON.stringify(remainingDiagnostics, null, 2)}`);
    });
  });
});

function findAndRemoveDiagnosticByMessage(message: string, diagnostics: vscode.Diagnostic[]) {
  const expectedDiagnostic = diagnostics.find((diagnostic) => {
    return diagnostic.message.indexOf(message) > -1;
  });
  if (!expectedDiagnostic) {
    assert.fail(`Expected to find diagnostic with message containing: ${message}\n` +
      ` Diagnostics: ${JSON.stringify(getDiagnosticMessages(diagnostics), null, 2)}`);
  } else {
    diagnostics.splice(diagnostics.indexOf(expectedDiagnostic), 1);
  }
}

function getDiagnosticMessages(diagnostics: vscode.Diagnostic[]) {
  return diagnostics.map((diagnostic) => {
    return diagnostic.message;
  });
}

// async function sleep(milliseconds?: number) {
//   const time = milliseconds ? milliseconds : 100;
//   await new Promise(resolve => setTimeout(resolve, time));
// }
