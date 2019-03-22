import get from 'lodash.get';

import { Node } from '../interfaces/Node';
import { NodeTypes } from './NodeTypes';

export class EmptyNode {
  public static readonly EMPTY_NODE: Node = {
    type: NodeTypes.EMPTY,
    items: [],
    references: [],
    range: [0, 0],
    tag: '',
    get: () => { return EmptyNode.EMPTY_NODE; },
    comment: '',
    commentBefore: '',
    toJSON: () => { return '{}'; },
    get key(): Node { return EmptyNode.EMPTY_NODE; },
  };
}

export function getYamlNodeKeys(yamlNode: any): string[] {
  if (yamlNode && yamlNode.items) {
    return yamlNode.items.map((itemNode) => {
      return itemNode.stringKey;
    });
  }
  return [];
}

export function getNodeValueIfPair(node: Node): Node {
  if (!node || node.type === NodeTypes.EMPTY) return EmptyNode.EMPTY_NODE;
  const nodeValue = (node.type === NodeTypes.PAIR ? get(node, 'value') : node) as Node;
  nodeValue.stringKey = nodeValue.stringKey ? nodeValue.stringKey : node.stringKey;
  return nodeValue;
}

export function getNodeItemByStringKey(node: Node, stringKey: string): Node {
  const item = node.items.find((nodePair: Node) => {
    return nodePair.stringKey === stringKey;
  });
  return item ? item : EmptyNode.EMPTY_NODE;
}
