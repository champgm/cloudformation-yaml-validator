import { Definition, Definitions } from './Definition';

export namespace SubStack {
  export interface ParameterDefinition extends Definition {
    hasDefault: boolean;
  }

  export interface ParameterDefinitionMap {
    [uriString: string]: ParameterDefinition[];
  }

  export interface SubStackDefinitions {
    outputs: Definitions;
    parameters: ParameterDefinitionMap;
  }

  export function flattenReferenceables(allReferenceables: SubStackDefinitions[]): SubStackDefinitions {
    const resultantReferenceables: SubStackDefinitions = {
      outputs: new Definitions(),
      parameters: {},
    };
    allReferenceables.forEach((referenceable) => {
      resultantReferenceables.outputs = new Definitions(
        ...resultantReferenceables.outputs,
        ...referenceable.outputs,
      );
      resultantReferenceables.parameters = SubStack.flattenParameterReferenceablesMapsMaps([
        resultantReferenceables.parameters,
        referenceable.parameters,
      ]);
    });
    return resultantReferenceables;
  }

  export function flattenParameterReferenceablesMapsMaps(allParameterReferenceablesMaps: ParameterDefinitionMap[]): ParameterDefinitionMap {
    const referenceablesMap = {};
    allParameterReferenceablesMaps.forEach((map) => {
      Object.keys(map).forEach((templateUrl) => {
        const existingReferenceables = referenceablesMap[templateUrl];
        if (existingReferenceables) {
          referenceablesMap[templateUrl] = [
            ...existingReferenceables,
            ...map[templateUrl],
          ];
        } else {
          referenceablesMap[templateUrl] = map[templateUrl];
        }
      });
    });
    return referenceablesMap;
  }
}
