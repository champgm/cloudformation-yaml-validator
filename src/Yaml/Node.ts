import YAML from 'yaml';
import { NodeTypes } from './NodeTypes';
import { Reference, References } from '../common/Reference';

export type Node = YAML.ast.Node & {
  type: NodeTypes;
  key: Node;
  items: Node[];
  stringKey?: string;
  get: (key: string) => Node | string;
  value?: Node | string;
  range: number[];
  references: References;
};
