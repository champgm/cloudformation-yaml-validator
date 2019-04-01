import vscode from 'vscode';
import { Node } from './Node';
import { SubStack } from '../common/SubStack';
import { cloneDeep } from 'lodash';

export interface NodeTraversal {
  fullText: string;
  documentUri: vscode.Uri;
  conditions: string[];
  mappings: string[];
  nodesWhichReference: Node[];
  parameters: string[];
  resources: string[];
  subStackReferenceables: SubStack.Referenceables;
}

export namespace NodeTraversal {
  export const EMPTY_TRAVERSAL: NodeTraversal = {
    conditions: [],
    mappings: [],
    nodesWhichReference: [],
    parameters: [],
    resources: [],
    subStackReferenceables: { outputs: [], parameters: {} },
    fullText: '',
    documentUri: undefined as any,
  };
  export function flatten(nodeTraversal: NodeTraversal[]) {
    const flattenedTraversal = cloneDeep(NodeTraversal.EMPTY_TRAVERSAL);
    nodeTraversal.forEach((nodeTraversal) => {
      flattenedTraversal.conditions = [
        ...flattenedTraversal.conditions,
        ...nodeTraversal.conditions,
      ];
      flattenedTraversal.mappings = [
        ...flattenedTraversal.mappings,
        ...nodeTraversal.mappings,
      ];
      flattenedTraversal.nodesWhichReference = [
        ...flattenedTraversal.nodesWhichReference,
        ...nodeTraversal.nodesWhichReference,
      ];
      flattenedTraversal.parameters = [
        ...flattenedTraversal.parameters,
        ...nodeTraversal.parameters,
      ];
      flattenedTraversal.resources = [
        ...flattenedTraversal.resources,
        ...nodeTraversal.resources,
      ];
      flattenedTraversal.subStackReferenceables = SubStack.flattenReferenceables([flattenedTraversal.subStackReferenceables, nodeTraversal.subStackReferenceables]);
      flattenedTraversal.fullText = nodeTraversal.fullText;
      flattenedTraversal.documentUri = nodeTraversal.documentUri;
    });

    return flattenedTraversal;
  }
}
