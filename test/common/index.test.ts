import fs from 'fs';
import { revealAllProperties, flattenArray } from '../../src/common';
import assert from 'assert';

import mocha from 'mocha';
import { RowColumnPosition } from '../../src/common/RowColumnPosition';
const describe = (mocha as any).describe;
const it = (mocha as any).it;

describe('common', () => {
  describe('revealAllProperties', () => {
    it('should reveal all error properties', async () => {
      const error = new Error('an error message');
      const revealedError = revealAllProperties(error);
      assert.deepEqual(Object.keys(revealedError), [
        'constructor',
        '__defineGetter__',
        '__defineSetter__',
        'hasOwnProperty',
        '__lookupGetter__',
        '__lookupSetter__',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toString',
        'valueOf',
        'toLocaleString',
        'name',
        'message',
        'stack',
      ]);
    });
    it('should not reveal any extra fields for empty objects', async () => {
      const empty = {};
      const revealedEmpty = revealAllProperties(empty);
      assert.deepEqual(Object.keys(revealedEmpty), [
        'constructor',
        '__defineGetter__',
        '__defineSetter__',
        'hasOwnProperty',
        '__lookupGetter__',
        '__lookupSetter__',
        'isPrototypeOf',
        'propertyIsEnumerable',
        'toString',
        'valueOf',
        'toLocaleString',
      ]);
    });
  });
  describe('flattenArray', () => {
    it('should flatten arrays', async () => {
      const arrayArray = [
        ['a'],
        ['s'],
        ['d'],
        ['f'],
      ];
      const flattened = flattenArray(arrayArray);
      assert.deepEqual(flattened, ['a', 's', 'd', 'f']);
    });
  });
});
