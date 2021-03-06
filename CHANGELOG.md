# Change Log

All notable changes to the "cloudformation-yaml-validator" extension should be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.3.13] - [0.3.14]
### Changed
 - GH-34: Fixed an issue where the recursive command generated a bunch of false positives and opened EVERY sub stack file

## [0.3.11] - [0.3.12]
### Changed
 - GH-31: Fixed a dependency issue which broke manually running commands

## [0.3.3] - [0.3.10]
### Changed
 - A bunch of thrashing trying to clean up build steps and find/fix an issue where the extension's commands aren't showing up when it is installed through the marketplace

## [0.3.2]
### Changed
 - Refactoring/Cleanup and better integration tests

## [0.3.1]
### Changed
 - Fixed the auto-start trigger when a file is opened

## [0.3.0]
### Added
 - GH-20: Added a command to recursively search through sub stacks

## [0.2.6]
### Changed
 - GH-23: Verified `!Join` tags work fine
 - Touched up README

## [0.2.5]
### Changed
 - GH-21: Fixed native resource attribute references
 - Also fixed an issue where fields using single quotes were handled incorrectly

## [0.2.2] & [0.2.3] & [0.2.4]
### Changed
 - More extension manifest thrashing

## [0.2.1]
### Changed
 - Better README notes, changelog

## [0.2.0]
### Changed
 - Fixed sub stack attribute handling
 - Improved unit and integration tests
 - Better readme

## [0.1.0]
### Added
 - First release for the marketplace

## [0.0.1]
### Added
 - Beta release for scott