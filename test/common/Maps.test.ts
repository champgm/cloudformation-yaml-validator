import assert from 'assert';
import { Maps } from '../../src/common/Maps';
import { ReferenceTypes } from '../../src/common/ReferenceTypes';

import mocha from 'mocha';
const describe = (mocha as any).describe;
const it = (mocha as any).it;

describe('Maps', () => {
  describe('nodeTagToReferenceType', () => {
    it('should map to proper ReferenceTypes', async () => {
      const ifTag = '!If';
      assert.deepEqual(Maps.nodeTagToReferenceType[ifTag], ReferenceTypes.IF);
      const findInMapTag = '!FindInMap';
      assert.deepEqual(Maps.nodeTagToReferenceType[findInMapTag], ReferenceTypes.FIND_IN_MAP);
      const dependsOnTag = 'DependsOn';
      assert.deepEqual(Maps.nodeTagToReferenceType[dependsOnTag], ReferenceTypes.DEPENDS_ON);
    });
  });
  describe('nodeTypeToSubOffset', () => {
    const plainType = 'PLAIN';
    assert.deepEqual(Maps.nodeTypeToSubOffset[plainType], 0);
    const quotesType = 'QUOTE_DOUBLE';
    assert.deepEqual(Maps.nodeTypeToSubOffset[quotesType], 1);
  });
  describe('referenceTypeToDiagnosticMessage', () => {
    const supportedReferenceTypes = Object.keys(Maps.referenceTypeToDiagnosticMessage);
    supportedReferenceTypes.forEach((referenceType) => {

      const key = 'key';
      switch (referenceType as ReferenceTypes) {
        case ReferenceTypes.DEPENDS_ON:
          assert.deepEqual(Maps.referenceTypeToDiagnosticMessage[referenceType](key), 'Unable to find referenced resource, \'key\'');
          break;
        case ReferenceTypes.FIND_IN_MAP:
          assert.deepEqual(Maps.referenceTypeToDiagnosticMessage[referenceType](key), 'Unable to find referenced map, \'key\'');
          break;
        case ReferenceTypes.GET_ATT:
          assert.deepEqual(Maps.referenceTypeToDiagnosticMessage[referenceType](key), 'Unable to find referenced sub stack output, \'key\'');
          break;
        case ReferenceTypes.IF:
          assert.deepEqual(Maps.referenceTypeToDiagnosticMessage[referenceType](key), 'Unable to find referenced condition, \'key\'');
          break;
        case ReferenceTypes.REF:
          assert.deepEqual(Maps.referenceTypeToDiagnosticMessage[referenceType](key), 'Unable to find referenced value, \'key\'');
          break;
        case ReferenceTypes.SUB:
          assert.deepEqual(Maps.referenceTypeToDiagnosticMessage[referenceType](key), 'Unable to find referenced value, \'key\'');
          break;
        default:
          assert.fail(`Untested ReferenceType found: ${referenceType}`);
          break;
      }

    })
  });
});
