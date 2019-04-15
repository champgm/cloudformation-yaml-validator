import { SubStack } from './SubStack';
import { Location, Uri, Range } from 'vscode';

export class Definition extends Location {
  constructor(public name: string, uri: Uri, range: Range) {
    super(uri, range);
  }
}
// export interface Definition extends Location {
//   name: string;
// }

export class Definitions extends Array<Definition> {
  public contains(name: string) {
    return !!this.find(definition => definition.name === name);
  }
}

export interface LocalDefinitions {
  conditions: Definition[];
  mappings: Definition[];
  parameters: Definition[];
  resources: Definition[];
  subStackDefinitions: SubStack.Substack.Definitions;
}
