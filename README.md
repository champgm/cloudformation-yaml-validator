# Cloudformation YAML Validator

[![Version](https://vsmarketplacebadge.apphb.com/version/champgm.cloudformation-yaml-validator.svg)](https://marketplace.visualstudio.com/items?itemName=champgm.cloudformation-yaml-validator) [![Travis](https://img.shields.io/travis/champgm/cloudformation-yaml-validator/master.svg)](https://travis-ci.org/champgm/cloudformation-yaml-validator)

## Features

This extension identifies and highlights many common Cloudformation YAML errors that can slow down your development time:
 * `!Ref`s to nonexistent values
 * `!Sub`s with references to nonexistent values
 * `!If`s referencing conditions that do not exist
 * `!FindInMap`s referencing maps that do not exist
 * `AWS::CloudFormation::Stack` parameters (with and without default values) missing values

It also identifies and highlights some situations that might be cause for concern
 * Missing optional parameter values when building `AWS::CloudFormation::Stack` resources
 
 ![image](https://user-images.githubusercontent.com/2091382/54885220-38df0180-4e50-11e9-9340-bf7cc1a4d966.png)

## Triggers

The extension should be triggered automatically when loading `YAML` or `YML` files.

To run it manually, open the command pallet and select "Cloud Formation YAML Validator: Validate YAML"

## Known Issues

Known issues can be found here: https://github.com/champgm/cloudformation-yaml-validator/issues

Please log more if you find any.
