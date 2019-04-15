import vscode, { Location } from 'vscode';
import { Node } from './Node';
import { SubStack } from '../common/SubStack';
import clone from 'lodash.clonedeep';
import { Definition, Definitions } from '../common/Definition';

export interface NodeTraversal {
  fullText: string;
  documentUri: vscode.Uri;
  nodesWhichReference: Node[];
  localDefinitions: Definitions;
  subStackDefinitions: SubStack.SubStackDefinitions;
}

export namespace NodeTraversal {
  export const EMPTY_TRAVERSAL: NodeTraversal = {
    nodesWhichReference: [],
    localDefinitions: new Definitions,
    subStackDefinitions: { outputs: new Definitions(), parameters: {} },
    fullText: '',
    documentUri: undefined as any,
  };
  export function flatten(nodeTraversal: NodeTraversal[]) {
    const flattenedTraversal = clone(NodeTraversal.EMPTY_TRAVERSAL);
    nodeTraversal.forEach((nodeTraversal) => {
      flattenedTraversal.localDefinitions = new Definitions(
        ...flattenedTraversal.localDefinitions,
        ...nodeTraversal.localDefinitions,
      );
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
