import { SubStackReferenceables } from './SubStackReferenceables';

export interface Referenceables {
  conditions: string[];
  mappings: string[];
  parameters: string[];
  resources: string[];
  subStackReferenceables: SubStackReferenceables;
}
