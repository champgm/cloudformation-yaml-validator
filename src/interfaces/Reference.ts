import { ReferenceTypes } from '../common/ReferenceTypes';

export interface Reference {
  type: ReferenceTypes;
  absoluteKeyPosition: number;
  referencedKey: string;
}
