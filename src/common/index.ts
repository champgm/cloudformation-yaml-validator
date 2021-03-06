import clone from 'lodash.clonedeep';
import { RowColumnPosition } from './RowColumnPosition';

export function revealAllProperties(object: any): any {
  const objectReferences: any[] = [];

  do {
    objectReferences.unshift(object);
    // tslint:disable-next-line: no-parameter-reassignment
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

export function hasValue(value: any) {
  const booleanValue = !!value;
  if (booleanValue) return booleanValue;
  return (value === 0 || value === '');
}
