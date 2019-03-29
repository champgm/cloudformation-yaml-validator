# Cloudformation YAML Validator

[![Version](https://vsmarketplacebadge.apphb.com/version/champgm.cloudformation-yaml-validator.svg)](https://marketplace.visualstudio.com/items?itemName=champgm.cloudformation-yaml-validator) [![Installs](https://vsmarketplacebadge.apphb.com/installs/champgm.cloudformation-yaml-validator.svg)](https://marketplace.visualstudio.com/items?itemName=champgm.cloudformation-yaml-validato) [![Travis](https://img.shields.io/travis/champgm/cloudformation-yaml-validator/master.svg)](https://travis-ci.org/champgm/cloudformation-yaml-validator)

## Features

This extension focuses on reference errors in Cloudformation YAML files and their sub-stack resources. It is best used together with a linting plugin like [`vscode-cfn-lint`](https://marketplace.visualstudio.com/items?itemName=kddejong.vscode-cfn-lint), which can warn you about errors specific to AWS resources.

Here are some things this extension will warn you about:
 * `!Ref`s to nonexistent values
 * `!Sub`s with references to nonexistent values
 * `!If`s referencing conditions that do not exist
 * `!FindInMap`s referencing maps that do not exist
 * `AWS::CloudFormation::Stack` parameters (with and without default values) missing values

![image](https://user-images.githubusercontent.com/2091382/54885220-38df0180-4e50-11e9-9340-bf7cc1a4d966.png)

## Triggers

The extension should be triggered automatically when loading `YAML` or `YML` files and it should avoid parsing non-cloudformation `YAML` files.

To run it manually, open the command pallet and select "Cloud Formation YAML Validator: Validate YAML"

To recursively search in sub stacks, open the command pallet and select "Cloud Formation YAML Validator: Validate YAML, recurse into sub stacks"

## Known Issues

Known issues can be found here: https://github.com/champgm/cloudformation-yaml-validator/issues

Please log more if you find any.
