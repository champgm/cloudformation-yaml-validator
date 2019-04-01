import YAML from 'yaml';
import { NodeTypes } from './NodeTypes';
import { Reference } from '../common/Reference';
import { revealAllProperties } from '../common';
import JSON from 'flatted';

export class Node implements YAML.ast.Node {
  public static readonly EMPTY_NODE: Node = Node.create();
  public static create(thing?: any): Node | NodePair {
    if (thing && thing.type === NodeTypes.PAIR) {
      return new NodePair(thing);
    }
    return new Node(thing);
  }

  public type: NodeTypes;
  public comment: string;
  public commentBefore: string;
  public astNode?: YAML.cst.Node;
  public range: [number, number];
  public tag: string;
  public items: Node[];
  public references: Reference[];
  public stringKey: string;
  public key: Node | string;
  public value: Node | string;

  constructor(yamlNode?: any) {
    this.astNode = yamlNode;
    if (yamlNode) {
      Object.assign(this, yamlNode);
    }
    this.comment = yamlNode ? yamlNode.comment : '';
    this.commentBefore = yamlNode ? yamlNode.commentBefore : '';
    this.range = yamlNode ? yamlNode.range : [0, 0];
    this.tag = yamlNode ? yamlNode.tag : '';
    this.stringKey = yamlNode ? yamlNode.stringKey : '';
    this.type = yamlNode && yamlNode.type ? yamlNode.type : NodeTypes.EMPTY;
    this.references = yamlNode && yamlNode.references ? yamlNode.references : [];

    if (yamlNode && yamlNode.items) {
      this.items = (yamlNode.items as YAML.ast.Node[]).map((item) => {
        return Node.create(item);
      });
    } else {
      this.items = [];
    }

    if (yamlNode && yamlNode.key) {
      this.key = Node.create(yamlNode.key);
    } else {
      this.key = '';
    }
    if (yamlNode && yamlNode.value) {
      if (typeof yamlNode.value === 'string') {
        this.value = yamlNode.value;
      } else {
        this.value = Node.create(yamlNode.value);
      }
    } else {
      this.value = '';
    }
  }

  public getKeys(): string[] {
    return this.items.map((itemNode) => {
      return itemNode.stringKey;
    });
  }

  public getValueIfPair(): Node {
    if (this.type !== NodeTypes.PAIR) {
      return this;
    }
    // If this is a pair, get the value, otherwise just keep the node
    const nodeValue = this.getNode('value');
    // If the pair value doesn't have its own key, set it to the key of the pair
    nodeValue.stringKey = nodeValue.stringKey ? nodeValue.stringKey : this.stringKey;
    return nodeValue;
  }

  public getNode(stringKey: string): Node {
    if (!(this.astNode as any).get) {
      throw new Error(`Node has no 'get' method: ${JSON.stringify(this)}`);
    }
    const got = (this.astNode as any).get(stringKey);
    throw new Error(`Item with key, '${stringKey}' was not a node: ${JSON.stringify(this)}`);
    return Node.create(got);
  }

  public getString(stringKey: string): string {
    if (!(this.astNode as any).get) {
      throw new Error(`Node has no 'get' method: ${JSON.stringify(this)}`);
    }
    const got = (this.astNode as any).get(stringKey);
    if (!got || typeof got !== 'string') {
      throw new Error(`Item with key, '${stringKey}' was not a string: ${JSON.stringify(this)}`);
    }
    return got;
  }

  public getItemByStringKey(stringKey: string): Node {
    const item = this.items.find((nodePair: Node) => {
      return nodePair.stringKey === stringKey;
    });
    return item ? item : Node.EMPTY_NODE;
  }

  public toJSON() {
    const stringified = '{' +

      '}';
    return stringified;
  }
}

export class NodePair extends Node {
  public key: Node;
  public value: Node;
  constructor(yamlNode?: any) {
    super(yamlNode);
    if (yamlNode.key) {
      this.key = Node.create(yamlNode.key);
    } else {
      this.key = Node.EMPTY_NODE;
    }
    if (yamlNode.value) {
      if (typeof yamlNode.value === 'string') {
        this.value = yamlNode.value;
      } else {
        this.value = Node.create(yamlNode.value);
      }
    } else {
      this.value = Node.EMPTY_NODE;
    }
  }
}
