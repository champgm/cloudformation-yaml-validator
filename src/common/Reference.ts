import { ReferenceTypes } from './ReferenceTypes';
import { Location, Uri, Range } from 'vscode';

export class Reference extends Location {
  constructor(
    public uri: Uri,
    public type: ReferenceTypes,
    public range: Range,
    public absolutePosition: number,
    public name: string,
  ) {
    super(uri, range);
  }
}

export class References extends Array<Reference> {
  public contains(name: string) {
    return !!this.find(reference => reference.name === name);
  }
}
