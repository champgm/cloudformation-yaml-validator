import { ReferenceTypes } from './ReferenceTypes';

export interface Reference {
  type: ReferenceTypes;
  absoluteKeyPosition: number;
  referencedKey: string;
}
