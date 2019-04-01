import YAML from 'yaml';
import { NodeTypes } from './NodeTypes';
import { Reference } from '../common/Reference';

// export type Node = YAML.ast.Node & {
//   type: NodeTypes;
//   key: Node;
//   items: Node[];
//   stringKey?: string;
//   get: (key: string) => Node | string;
//   value?: Node | string;
//   range: number[];
//   references: Reference[];
// };

// export interface Node extends YAML.ast.Node {
//   type: NodeTypes;
//   key: Node;
//   items: Node[];
//   stringKey?: string;
//   get: (key: string) => Node | string;
//   value?: Node | string;
//   // range: number[];
//   references: Reference[];
// }

export class Node implements YAML.ast.Node {
  public type: NodeTypes;
  public comment: string | null;
  public commentBefore: string | null;
  public cstNode?: YAML.cst.Node | undefined;
  public range: [number, number] | null;
  public tag: string | null;
  public items: Node[];
  public references: Reference[];
  public stringKey: string;
  toJSON() {
    return JSON.stringify(this);
  }
  public static readonly EMPTY_NODE: Node = {
    type: NodeTypes.EMPTY,
    items: [],
    references: [],
    range: [0, 0],
    tag: '',
    get: () => { return Node.EMPTY_NODE; },
    comment: '',
    commentBefore: '',
    toJSON: () => { return '{}'; },
    get key(): Node { return Node.EMPTY_NODE; },
  };

  constructor(yamlNode?: YAML.ast.Node) {
    if (yamlNode) {
      Object.assign(this, yamlNode);
    }
    this.comment = yamlNode ? yamlNode.comment : '';
    this.commentBefore = yamlNode ? yamlNode.commentBefore : '';
    this.range = yamlNode ? yamlNode.range : [0, 0];
    this.tag = yamlNode ? yamlNode.tag : '';
    this.stringKey = yamlNode ? (yamlNode as any).stringKey : '';
    this.type = yamlNode && (yamlNode as any).type ? (yamlNode as any).type : NodeTypes.EMPTY;
    this.items = yamlNode && (yamlNode as any).items ? (yamlNode as any).items : [];
    this.references = yamlNode && (yamlNode as any).references ? (yamlNode as any).references : [];
  }

  public getKeys(yamlNode: any): string[] {
    if (yamlNode && yamlNode.items) {
      return yamlNode.items.map((itemNode) => {
        return itemNode.stringKey;
      });
    }
    return [];
  }

  public getValueIfPair(): Node {
    if (this.type !== NodeTypes.PAIR) {
      return this;
    }
    // If this is a pair, get the value, otherwise just keep the node
    const nodeValue = this.get('value');
    // If the pair value doesn't have its own key, set it to the key of the pair
    nodeValue.stringKey = nodeValue.stringKey ? nodeValue.stringKey : this.stringKey;
    return nodeValue;
  }

  public get(stringKey: string) {
    return this.getItemByStringKey(stringKey).getValueIfPair();
  }

  public getItemByStringKey(stringKey: string): Node {
    const item = this.items.find((nodePair: Node) => {
      return nodePair.stringKey === stringKey;
    });
    return item ? item : Node.EMPTY_NODE;
  }

}

export namespace Node {

  export function create(thing: any) {

  }

}
