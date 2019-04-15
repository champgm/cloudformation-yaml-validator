import vscode, { Location } from 'vscode';
import { Node } from './Node';
import { SubStack } from '../common/SubStack';
import clone from 'lodash.clonedeep';
import { Definition } from '../common/Definition';

export interface NodeTraversal {
  fullText: string;
  documentUri: vscode.Uri;
  nodesWhichReference: Node[];
  localDefinitions: Definition[];
  subStackDefinitions: SubStack.Substack.Definitions;
}

export namespace NodeTraversal {
  export const EMPTY_TRAVERSAL: NodeTraversal = {
    nodesWhichReference: [],
    localDefinitions: [],
    subStackDefinitions: { outputs: [], parameters: {} },
    fullText: '',
    documentUri: undefined as any,
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
      flattenedTraversal.subStackDefinitions = SubStack.flattenReferenceables([flattenedTraversal.subStackDefinitions, nodeTraversal.subStackDefinitions]);
      flattenedTraversal.fullText = nodeTraversal.fullText;
      flattenedTraversal.documentUri = nodeTraversal.documentUri;
    });

    return flattenedTraversal;
  }
}
