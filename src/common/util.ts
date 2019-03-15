import vscode from 'vscode';
import clone from 'lodash.clone';
import { RowColumnPosition } from './interfaces';

export function revealAllProperties(object: any): any {
  const objectReferences: any[] = [];

  do {
    objectReferences.unshift(object);
  } while (object = Object.getPrototypeOf(object));

  const enumeratedObject: any = {};
  for (const objectReference of objectReferences) {
    Object.getOwnPropertyNames(objectReference).forEach((property) => {
      enumeratedObject[property] = clone(objectReference[property]);
    });
  }

  return enumeratedObject;
}

export function flattenArray(input: any[][]): any[] {
  const empty: any[] = [];
  return empty.concat.apply([], input);
}

export function createVsCodeRange(rowColumnPosition: RowColumnPosition, rangeLength: number): vscode.Range {
  return new vscode.Range(
    rowColumnPosition.line,
    rowColumnPosition.column,
    rowColumnPosition.line,
    rowColumnPosition.column + rangeLength,
  );
}
