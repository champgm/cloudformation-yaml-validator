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
      this.value = this;
    }
  }

  public getKeys(): string[] {
    return this.items.map((itemNode) => {
      return itemNode.stringKey;
    });
  }

  public getItemAsString(stringKey: string): string {
    const astValue = (this.astNode as any).get(stringKey);
    if (typeof astValue === 'string') {
      return astValue;
    }
    return '';
    // throw new Error(`Item ${stringKey} was not of type string: ${JSON.stringify(this)}`);
  }

  // Need to be recusrisve...
  // public getItemAsString(stringKey: string): string {
  //   if (this.type === NodeTypes.EMPTY) {
  //     return '';
  //   }
  //   if (this.stringKey === stringKey && typeof this.value === 'string') {
  //     return this.value;
  //   }
  //   if (this instanceof NodePair) {
  //     return this.value.getItemAsString(stringKey);
  //   }
  //   if (this instanceof Node) {
  //     return this.getItemAsNode(stringKey).getItemAsString(stringKey);
  //   }
  //   throw new Error(`Item ${stringKey} was not of type string: ${JSON.stringify(this)}`);
  // }

  public getItemAsNode(stringKey: string): Node {
    const node = this instanceof NodePair ? this.value : this;
    const item = node.getValueByStringKey(stringKey);
    if (item.value instanceof Node) {
      return item.value;
    }
    throw new Error(`Item ${stringKey} was not of type node: ${JSON.stringify(item)}`);
  }

  public getItemAsPair(stringKey: string): NodePair {
    const item = this.getValueByStringKey(stringKey);
    if (item instanceof NodePair) {
      return item;
    }
    throw new Error(`Item ${stringKey} was not of type NodePair: ${JSON.stringify(item)}`);
  }

  private getValueByStringKey(stringKey: string): Node {
    const item = this.items.find((nodePair: Node) => {
      return nodePair.stringKey === stringKey;
    });
    return item ? item : Node.EMPTY_NODE;
  }

  public toJSON() {
    const stringified = '{' +
      '"type":' + `"${this.type}"` +
      '"tag":' + `"${this.tag}"` +
      '"stringKey":' + `"${this.stringKey}"` +
      '"range":' + `"${this.range}"` +
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
