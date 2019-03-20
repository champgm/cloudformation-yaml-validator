import YAML from 'yaml';
import { NodeTypes } from '../common/NodeTypes';
import { Reference } from './Reference';

export type Node = YAML.ast.Node & {
  type: NodeTypes;
  key: Node;
  items: Node[];
  stringKey?: string;
  get: (key: string) => Node | string;
  value?: Node | string;
  range: number[];
  references: Reference[];
};
