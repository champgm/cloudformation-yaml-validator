import { EmptyNode, getYamlNodeKeys, getNodeValueIfPair, getNodeItemByStringKey } from '../../src/common/Yaml';

import mocha from 'mocha';
import assert = require('assert');
import { NodeTypes } from '../../src/common/NodeTypes';
const describe = (mocha as any).describe;
const it = (mocha as any).it;

describe('Yaml', () => {
  describe('EmptyNode', () => {
    it('should return an empty node', async () => {
      assert.deepEqual(EmptyNode.EMPTY_NODE.type, NodeTypes.EMPTY);
      assert.deepEqual(EmptyNode.EMPTY_NODE.items, []);
      assert.deepEqual(EmptyNode.EMPTY_NODE.references, []);
      assert.deepEqual(EmptyNode.EMPTY_NODE.range, [0, 0]);
      assert.deepEqual(EmptyNode.EMPTY_NODE.tag, '');
      assert.deepEqual(EmptyNode.EMPTY_NODE.get('anything'), EmptyNode.EMPTY_NODE, 'EMPTY_NODE should return itself when \'get\' is called');
      assert.deepEqual(EmptyNode.EMPTY_NODE.comment, '');
      assert.deepEqual(EmptyNode.EMPTY_NODE.commentBefore, '');
      assert.deepEqual(EmptyNode.EMPTY_NODE.toJSON(), '{}');
      assert.deepEqual(EmptyNode.EMPTY_NODE.key, EmptyNode.EMPTY_NODE, 'EMPTY_NODE should have itself as \'key\'');
    });
  });
  describe('getYamlNodeKeys', () => {
    it('should return an empty array when passed EMPTY_NODE', async () => {
      const nodeKeys = getYamlNodeKeys(EmptyNode.EMPTY_NODE);
      assert.deepEqual(nodeKeys, []);
    });
    it('should return an empty array when passed undefined', async () => {
      const nodeKeys = getYamlNodeKeys(undefined);
      assert.deepEqual(nodeKeys, []);
    });
    it('should return an empty array when passed a node without items', async () => {
      const fakeNode: any = {};
      const nodeKeys = getYamlNodeKeys(fakeNode);
      assert.deepEqual(nodeKeys, []);
    });
    it('should return a node\s items\' stringKeys', async () => {
      const stringKey1 = 'stringKey1';
      const stringKey2 = 'stringKey2';
      const fakeNode: any = { items: [{ stringKey: stringKey2 }, { stringKey: stringKey1 }] };
      const nodeKeys = getYamlNodeKeys(fakeNode);
      assert.deepEqual(nodeKeys, [stringKey2, stringKey1]);
    });
  });
  describe('getNodeValueIfPair', () => {
    it('should return EMPTY_NODE if given undefined', async () => {
      const pair = getNodeValueIfPair(undefined as any);
      assert.deepEqual(pair, EmptyNode.EMPTY_NODE);
    });
    it('should return EMPTY_NODE if given EMPTY_NODE', async () => {
      const pair = getNodeValueIfPair(EmptyNode.EMPTY_NODE);
      assert.deepEqual(pair, EmptyNode.EMPTY_NODE);
    });
    it('should return the node if it\'s not a pair', async () => {
      const fakeNode: any = { type: NodeTypes.PLAIN };
      const value = getNodeValueIfPair(fakeNode);
      assert.deepEqual(value, fakeNode);
    });
    it('should return the pair\'s value, and carry forward stringKey if necessary', async () => {
      const stringKey = 'stringKey';
      const fakeNode: any = { type: NodeTypes.PLAIN };
      const fakePair: any = { stringKey, type: NodeTypes.PAIR, value: fakeNode };
      const value = getNodeValueIfPair(fakePair);
      assert.deepEqual(value, Object.assign(fakeNode, { stringKey }));
    });
    it('should not overwrite stringKey if the value has one', async () => {
      const fakeNode: any = { type: NodeTypes.PLAIN, stringKey: 'stringKey2' };
      const fakePair: any = { type: NodeTypes.PAIR, value: fakeNode, stringKey: 'stringKey1' };
      const value = getNodeValueIfPair(fakePair);
      assert.deepEqual(value, fakeNode);
    });
  });
  describe('getNodeItemByStringKey', () => {
    const stringKey1 = 'stringKey1';
    const stringKey2 = 'stringKey2';
    const node2 = { stringKey: stringKey2 };
    const node1 = { stringKey: stringKey1 };
    const fakeNode: any = { items: [node2, node1] };
    it('should return EMPTY_NODE if an item with the given key is not found', async () => {
      const item = getNodeItemByStringKey(fakeNode, 'stringKey3');
      assert.deepEqual(item, EmptyNode.EMPTY_NODE);
    });
    it('should return a node by stringKey', async () => {
      const item = getNodeItemByStringKey(fakeNode, stringKey2);
      assert.deepEqual(item, node2);
    });
  });
});
