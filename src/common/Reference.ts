import { ReferenceTypes } from './ReferenceTypes';
import { Location } from 'vscode';

export interface Reference extends Location {
  type: ReferenceTypes;
  absolutePosition: number;
  referencedKey: string;
}
