import { Node } from './Node';
import { Maps } from '../common/Maps';
import { ReferenceTypes } from '../common/ReferenceTypes';
import { Reference, References } from '../common/Reference';
import { Range, Uri, Position } from 'vscode';
import { getRowColumnPosition } from '../common/RowColumnPosition';

// This will find ALL ${references} in the !Sub
export function addToSub(uri: Uri, fullText: string, nodeValue: Node): Node[] {
  let match: RegExpExecArray;
  nodeValue.references = new References();
  const regEx = new RegExp('\\${[^}]*}', 'g');
  while ((match = (regEx.exec(nodeValue.value as string) as RegExpExecArray)) != null) {
    // Trim the ${} off of the match
    const referencedKey = match[0].substring(2, match[0].length - 1);
    if (!referencedKey.startsWith('AWS::')) {
      const quotesOffset = Maps.nodeTypeToSubOffset[nodeValue.type];
      // To calculate absolute position, add 5 because '!Sub ' is 5 and the range begins at the beginning of the field
      // Add 2 because we've trimmed off '${'
      // Add an offset for quotes (or not)
      const absoluteKeyStart = nodeValue.range[0] + 5 + quotesOffset + 2 + match.index;
      const absoluteKeyEnd = absoluteKeyStart + referencedKey.length;
      nodeValue.references.push(new Reference(
        uri,
        ReferenceTypes.SUB,
        new Range(
          getRowColumnPosition(fullText, absoluteKeyEnd),
          getRowColumnPosition(fullText, absoluteKeyEnd),
        ),
        absoluteKeyStart,
        referencedKey,
      ));
    }
  }
  return [nodeValue];
}

export function addToRef(uri: Uri, fullText: string, nodeValue: Node): Node[] {
  const referencedKey = nodeValue.value as string;
  if (!referencedKey.startsWith('AWS::')) {
    // Add 5 because '!Ref ' is 5 and the range begins at the beginning of the field
    const absoluteKeyStart = nodeValue.range[0] + 5;
    const absoluteKeyEnd = absoluteKeyStart + referencedKey.length;
    nodeValue.references =
      new References(new Reference(
        uri,
        ReferenceTypes.REF,
        new Range(
          getRowColumnPosition(fullText, absoluteKeyEnd),
          getRowColumnPosition(fullText, absoluteKeyEnd),
        ),
        absoluteKeyStart,
        referencedKey,
      ));
    return [nodeValue];
  }
  return [];
}

export function addToGetAtt(uri: Uri, fullText: string, nodeValue: Node): Node[] {
  const referencedKey = nodeValue.value as string;
  // Add 8 because '!GetAtt ' is 8 and the range begins at the beginning of the field
  const absoluteKeyStart = nodeValue.range[0] + 8;
  const absoluteKeyEnd = absoluteKeyStart + referencedKey.length;
  nodeValue.references =
    new References(new Reference(
      uri,
      ReferenceTypes.GET_ATT,
      new Range(
        getRowColumnPosition(fullText, absoluteKeyEnd),
        getRowColumnPosition(fullText, absoluteKeyEnd),
      ),
      absoluteKeyStart,
      referencedKey,
    ));
  return [nodeValue];
}

export function addToIfFindInMapOrDependsOn(uri: Uri, fullText: string, nodeValue: Node, nodeTag: string): Node[] {
  const referencedKey = nodeValue.value as string;
  if (!referencedKey.startsWith('AWS::')) {
    const absoluteKeyStart = nodeValue.range[0] ;
    const absoluteKeyEnd = absoluteKeyStart + referencedKey.length;
    nodeValue.references =
      new References(new Reference(
        uri,
        Maps.nodeTagToReferenceType[nodeTag],
        new Range(
          getRowColumnPosition(fullText, absoluteKeyEnd),
          getRowColumnPosition(fullText, absoluteKeyEnd),
        ),
        absoluteKeyStart,
        referencedKey,
      ));
    return [nodeValue];
  }
  return [];
}
