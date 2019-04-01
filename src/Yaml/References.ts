import { Node } from './Node';
import { Maps } from '../common/Maps';
import { ReferenceTypes } from '../common/ReferenceTypes';

export namespace References {
  // This will find ALL ${references} in the !Sub
  export function addToSub(nodeValue: Node): Node[] {
    let match: RegExpExecArray;
    nodeValue.references = [];
    const regEx = new RegExp('\\${[^}]*}', 'g');
    while ((match = (regEx.exec(nodeValue.value as string) as RegExpExecArray)) != null) {
      // Trim the ${} off of the match
      const referencedKey = match[0].substring(2, match[0].length - 1);
      if (!referencedKey.startsWith('AWS::')) {
        const quotesOffset = Maps.nodeTypeToSubOffset[nodeValue.type];
        const reference = {
          referencedKey,
          type: ReferenceTypes.SUB,
          // Add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
          // Add 2 because we've trimmed off '${'
          // Add an offset for quotes (or not)
          absoluteKeyPosition: nodeValue.range[0] + 5 + quotesOffset + 2 + match.index,
        };
        nodeValue.references.push(reference);
      }
    }
    return [nodeValue];
  }

  export function addToRef(nodeValue: Node): Node[] {
    const referencedKey = nodeValue.value as string;
    if (!referencedKey.startsWith('AWS::')) {
      nodeValue.references = [{
        referencedKey,
        type: ReferenceTypes.REF,
        // Add 5 because '!Ref ' is 5 and the range begins at the beginning of the field
        absoluteKeyPosition: nodeValue.range[0] + 5,
      }];
      return [nodeValue];
    }
    return [];
  }

  export function addToGetAtt(nodeValue: Node): Node[] {
    nodeValue.references = [{
      type: ReferenceTypes.GET_ATT,
      referencedKey: nodeValue.value as string,
      // Add 8 because '!GetAtt ' is 8 and the range begins at the beginning of the field
      absoluteKeyPosition: nodeValue.range[0] + 8,
    }];
    return [nodeValue];
  }

  export function addToIfFindInMapDependsOn(nodeValue: Node, nodeTag: string): Node[] {
    const referencedKey:string = nodeValue.value as string;
    if (!referencedKey.startsWith('AWS::')) {
      nodeValue.references = [{
        referencedKey,
        type: Maps.nodeTagToReferenceType[nodeTag],
        absoluteKeyPosition: nodeValue.range[0],
      }];
      return [nodeValue];
    }
    return [];
  }
}
