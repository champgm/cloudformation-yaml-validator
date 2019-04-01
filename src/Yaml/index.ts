import get from 'lodash.get';

import { Node } from './Node';
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
