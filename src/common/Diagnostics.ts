import vscode from 'vscode';
import { RowColumnPosition } from '../interfaces/RowColumnPosition';

export function createDiagnostic(position: RowColumnPosition, length: number, severity: vscode.DiagnosticSeverity, message: string) {
  const range = new vscode.Range(position.line, position.column, position.line, position.column + length);
  return new vscode.Diagnostic(range, message, severity);
}
