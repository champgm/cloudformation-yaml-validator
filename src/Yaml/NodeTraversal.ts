import vscode from 'vscode';
import { Node } from './Node';
import { SubStack } from '../common/SubStack';
import clone from 'lodash.clonedeep';

export interface NodeTraversal {
  fullText: string;
  documentUri: vscode.Uri;
  nodesWhichReference: Node[];
  localDefinitions: string[];
  subStackDefinitions: SubStack.Definitions;
}

export namespace NodeTraversal {
  export const EMPTY_TRAVERSAL: NodeTraversal = {
    nodesWhichReference: [],
    localDefinitions: [],
    subStackDefinitions: { outputs: [], parameters: {} },
    fullText: '',
    documentUri: vscode.Uri.parse(''),
  };
  export function flatten(nodeTraversal: NodeTraversal[]) {
    const flattenedTraversal = clone(NodeTraversal.EMPTY_TRAVERSAL);
    nodeTraversal.forEach((nodeTraversal) => {
      flattenedTraversal.localDefinitions = [
        ...flattenedTraversal.localDefinitions,
        ...nodeTraversal.localDefinitions,
      ];
      flattenedTraversal.nodesWhichReference = [
        ...flattenedTraversal.nodesWhichReference,
        ...nodeTraversal.nodesWhichReference,
      ];
      flattenedTraversal.subStackDefinitions = SubStack.flattenDefinitions([
        flattenedTraversal.subStackDefinitions,
        nodeTraversal.subStackDefinitions,
      ]);
      flattenedTraversal.fullText = nodeTraversal.fullText;
      flattenedTraversal.documentUri = nodeTraversal.documentUri;
    });

    return flattenedTraversal;
  }
}
