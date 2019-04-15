import get from 'lodash.get';

import { Node } from './Node';
import { NodeTypes } from './NodeTypes';
import { Definitions, Definition } from '../common/Definition';
import { Range, Uri } from 'vscode';
import { getRowColumnPosition } from '../common/RowColumnPosition';
import { References } from '../common/Reference';

export class EmptyNode {
  public static readonly EMPTY_NODE: Node = {
    type: NodeTypes.EMPTY,
    items: [],
    references: new References(),
    range: [0, 0],
    tag: '',
    get: () => { return EmptyNode.EMPTY_NODE; },
    comment: '',
    commentBefore: '',
    toJSON: () => { return '{}'; },
    get key(): Node { return EmptyNode.EMPTY_NODE; },
  };
}

export function getYamlNodeKeys(uri: Uri, yamlNode: Node, fullText: string): Definitions {
  if (yamlNode && yamlNode.items) {
    const definitions = yamlNode.items.filter(itemNode => !!itemNode.stringKey)
      .map((itemNode) => {
        return new Definition(
          uri,
          itemNode.stringKey as string,
          new Range(
            getRowColumnPosition(fullText, itemNode.range[0]),
            getRowColumnPosition(fullText, itemNode.range[1]),
          ),
        );
      });
    return new Definitions(...definitions);
  }
  return new Definitions();
}

export function getNodeValueIfPair(node: Node): Node {
  // If it's empty, just return EMPTY_NODE
  if (!node || node.type === NodeTypes.EMPTY) return EmptyNode.EMPTY_NODE;
  // If it's a pair, get the value, otherwise just keep the node
  const nodeValue = (node.type === NodeTypes.PAIR ? get(node, 'value') : node) as Node;
  // If the pair value doesn't have its own key, set it to the key of the pair
  nodeValue.stringKey = nodeValue.stringKey ? nodeValue.stringKey : node.stringKey;
  return nodeValue;
}

export function getNodeItemByStringKey(node: Node, stringKey: string): Node {
  if (!node || !node.items) {
    return EmptyNode.EMPTY_NODE;
  }
  const item = node.items.find((nodePair: Node) => {
    return nodePair.stringKey === stringKey;
  });
  return item ? item : EmptyNode.EMPTY_NODE;
}
