import vscode from 'vscode';
import { RowColumnPosition } from '../interfaces/RowColumnPosition';

export function createDiagnostic(position: RowColumnPosition, length: number, severity: vscode.DiagnosticSeverity, message: string) {
  const range = createVsCodeRange(position, length);
  return new vscode.Diagnostic(range, message, severity);
}

export function createVsCodeRange(rowColumnPosition: RowColumnPosition, length: number): vscode.Range {
  return new vscode.Range(
    rowColumnPosition.line,
    rowColumnPosition.column,
    rowColumnPosition.line,
    rowColumnPosition.column + length,
  );
}
