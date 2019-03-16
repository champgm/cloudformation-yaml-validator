import fs from 'fs';
import YAML from 'yaml';
import assert from 'assert';

import { CloudformationYaml } from '../CloudformationYaml';

suite('CloudformationYaml Unit Tests', () => {
  const backToProjectDirectory = '../..';
  const cloudformationYaml: any = new CloudformationYaml();

  suite('findSubStackNodePairs', () => {
    test('Finds all substack nodes', () => {
      const filePath = `${__dirname}/${backToProjectDirectory}/src/test/resources/valid_yaml/test.yml`;
      const fileText = fs.readFileSync(filePath, 'utf8');
      const document = YAML.parseDocument(fileText, { keepCstNodes: true });
      const subStackNodePairs: any[] = cloudformationYaml.findSubStackNodePairs(document);
      assert.deepEqual(subStackNodePairs.length, 1, 'There should be 1 substack node');
      assert.deepEqual(subStackNodePairs[0].stringKey, 'FirstSubStack');
    });
  });
});
