import { ReferenceTypes } from './ReferenceTypes';

export namespace Maps {
  export const nodeTagToReferenceType = {
    '!If': ReferenceTypes.IF,
    '!FindInMap': ReferenceTypes.FIND_IN_MAP,
    DependsOn: ReferenceTypes.DEPENDS_ON,
  };

  export const nodeTypeToSubOffset = {
    PLAIN: 0,
    QUOTE_DOUBLE: 1,
  };

  export const referenceTypeToDiagnosticMessage: { [referenceType: string]: (key: string) => string } = {
    [ReferenceTypes.DEPENDS_ON]: key => `Unable to find referenced resource, '${key}'`,
    [ReferenceTypes.FIND_IN_MAP]: key => `Unable to find referenced map, '${key}'`,
    [ReferenceTypes.GET_ATT]: key => `Unable to find referenced sub stack output, '${key}'`,
    [ReferenceTypes.IF]: key => `Unable to find referenced condition, '${key}'`,
    [ReferenceTypes.REF]: key => `Unable to find referenced value, '${key}'`,
    [ReferenceTypes.SUB]: key => `Unable to find referenced value, '${key}'`,
  };
}
