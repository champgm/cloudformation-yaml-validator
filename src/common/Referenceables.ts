import { SubStack } from './SubStack';

export interface Referenceables {
  conditions: string[];
  mappings: string[];
  parameters: string[];
  resources: string[];
  subStackReferenceables: SubStack.Referenceables;
}
