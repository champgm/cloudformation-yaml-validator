import vscode from 'vscode';
import { Node } from './Node';
import { SubStack } from '../common/SubStack';
import { cloneDeep } from 'lodash';

export interface NodeTraversal {
  fullText: string;
  documentUri: vscode.Uri;
  nodesWhichReference: Node[];
  localReferenceables: string[];
  subStackReferenceables: SubStack.Referenceables;
}

export namespace NodeTraversal {
  export const EMPTY_TRAVERSAL: NodeTraversal = {
    nodesWhichReference: [],
    localReferenceables: [],
    subStackReferenceables: { outputs: [], parameters: {} },
    fullText: '',
    documentUri: undefined as any,
  };
  export function flatten(nodeTraversal: NodeTraversal[]) {
    const flattenedTraversal = cloneDeep(NodeTraversal.EMPTY_TRAVERSAL);
    nodeTraversal.forEach((nodeTraversal) => {
      flattenedTraversal.localReferenceables = [
        ...flattenedTraversal.localReferenceables,
        ...nodeTraversal.localReferenceables,
      ];
      flattenedTraversal.nodesWhichReference = [
        ...flattenedTraversal.nodesWhichReference,
        ...nodeTraversal.nodesWhichReference,
      ];
      flattenedTraversal.subStackReferenceables = SubStack.flattenReferenceables([flattenedTraversal.subStackReferenceables, nodeTraversal.subStackReferenceables]);
      flattenedTraversal.fullText = nodeTraversal.fullText;
      flattenedTraversal.documentUri = nodeTraversal.documentUri;
    });

    return flattenedTraversal;
  }
}
