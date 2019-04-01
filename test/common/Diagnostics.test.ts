import vscode from 'vscode';
import assert from 'assert';
import { RowColumnPosition } from '../../src/common/RowColumnPosition';
import { createDiagnostic, createVsCodeRange } from '../../src/common/Diagnostics';

import mocha from 'mocha';
const describe = (mocha as any).describe;
const it = (mocha as any).it;

describe('Diagnostics', () => {
  describe('createDiagnostic', () => {
    it('should properly calculate Range values', async () => {
      const position: RowColumnPosition = {
        line: 100,
        column: 100,
      };
      const length: number = 10;
      const severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Hint;
      const message: string = 'Diagnostic Message';
      const diagnostic = createDiagnostic(position, length, severity, message);
      assert.deepEqual(diagnostic.severity, severity);
      assert.deepEqual(diagnostic.message, message);
      assert.deepEqual(diagnostic.range.start.line, position.line);
      assert.deepEqual(diagnostic.range.start.character, position.column);
      assert.deepEqual(diagnostic.range.end.line, position.line);
      assert.deepEqual(diagnostic.range.end.character, position.column + length);
    });
  });
  describe('createVsCodeRange', () => {
    it('should create a correct range', async () => {
      const length = 100;
      const position: RowColumnPosition = {
        line: 100,
        column: 100,
      };
      const range = createVsCodeRange(position, length);
      assert.deepEqual(range.start.line, position.line);
      assert.deepEqual(range.start.character, position.column);
      assert.deepEqual(range.end.line, position.line);
      assert.deepEqual(range.end.character, position.column + length);
    });
  });
});
