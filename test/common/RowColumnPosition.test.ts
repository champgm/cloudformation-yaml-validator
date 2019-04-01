import fs from 'fs';
import { getRowColumnPosition, RowColumnPosition } from '../../src/common/RowColumnPosition';
import assert from 'assert';

import mocha from 'mocha';
const describe = (mocha as any).describe;
const it = (mocha as any).it;

describe('RowColumnPosition', () => {
  describe('getRowColumnPosition', () => {
    it('should calculate row and column correctly', async () => {
      const validYamlText = fs.readFileSync(`${__dirname}/../../../test/resources/valid_yaml/test.yml`).toString();
      const rowColumnPosition = getRowColumnPosition(validYamlText, 200);
      const expectedRowColumnPosition: RowColumnPosition = { column: 1, line: 11 };
      assert.deepEqual(rowColumnPosition, expectedRowColumnPosition);
    });
  });
});
