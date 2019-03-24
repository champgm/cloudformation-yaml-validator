// Taken from https://rpeshkov.net/blog/vscode-extension-coverage/

console.log(`I guess this file was imported somewhere`);

'use strict';

declare var global: any;

/* tslint:disable no-require-imports */

import fs from 'fs';
import glob from 'glob';
import paths from 'path';

const istanbul = require('istanbul');
const Mocha = require('mocha');
const remapIstanbul = require('remap-istanbul');

// Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
// Since we are not running in a tty environment, we just implement the method statically
const tty = require('tty');
if (!tty.getWindowSize) {
  tty.getWindowSize = (): number[] => {
    return [80, 75];
  };
}

let mochaOptions = {};
function configure(mochaOpts: any): void {
  // mocha = new Mocha(mochaOpts);
  mochaOptions = mochaOpts ? mochaOpts : {};
}
exports.configure = configure;

function _mkDirIfExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function _readCoverOptions(testsRoot: string): ITestRunnerOptions | undefined {
  const coverConfigPath = paths.join(testsRoot, '..', '..', 'coverconfig.json');
  console.log(`Cover config path: ${coverConfigPath}`);
  if (fs.existsSync(coverConfigPath)) {
    const configContent = fs.readFileSync(coverConfigPath, 'utf-8');
    const configObject = JSON.parse(configContent);
    console.log(`Coverage config: ${JSON.stringify(configObject, null, 2)}`);
    return configObject;
  }
  return undefined;
}

function run(testsRoot: string, clb: any): any {
  console.log(`The run method was called`);

  let failureCount = 0;

  let integrationDone = false;
  let unitDone = false;
  const integrationCallback = () => {
    integrationDone = true;
    if (unitDone) {
      clb(undefined, failureCount);
    }
  };
  const unitCallback = () => {
    unitDone = true;
    if (integrationDone) {
      clb(undefined, failureCount);
    }
  };

  // Do integration tests, but don't collect coverage.
  console.log(`Run Integration Tests`);
  const integrationMocha = new Mocha(Object.assign(mochaOptions, { ui: 'tdd', useColors: false }));
  try {
    const integrationTests = glob.sync('**/**.test.integration.js', { cwd: testsRoot });
    // Fill into Mocha
    integrationTests.forEach((file): Mocha => {
      console.log(`Adding file to Mocha: ${file}`);
      return integrationMocha.addFile(paths.join(testsRoot, file));
    });

    // Run the tests
    integrationMocha.run()
      .on('fail', () => failureCount += 1)
      .on('end', () => {
        console.log(`Integration tests are complete`);
        integrationCallback();
      });
  } catch (error) {
    return clb(error);
  }

  // Read configuration for the coverage file
  const coverOptions = _readCoverOptions(testsRoot);
  let coverageRunner;
  if (coverOptions && coverOptions.enabled) {
    // Setup coverage pre-test, including post-test hook to report
    coverageRunner = new CoverageRunner(coverOptions, testsRoot);
    coverageRunner.setupCoverage();
  }

  // Do the rest of the test files, and collect coverage
  console.log(`Run Unit Tests`);
  const integrationOptions = Object.assign(mochaOptions, { ui: 'tdd', useColors: false });
  const unitMocha = new Mocha(integrationOptions);
  const unitTests = glob.sync('**/**.test.js', { cwd: testsRoot });
  try {
    // Fill into Mocha
    unitTests.forEach((file): Mocha => {
      console.log(`Adding file to Mocha: ${file}`);
      return unitMocha.addFile(paths.join(testsRoot, file));
    });

    // Run the tests
    unitMocha.run()
      .on('fail', () => failureCount += 1)
      .on('end', () => {
        console.log(`Unit tests are complete`);
        if (coverageRunner) coverageRunner.reportCoverage();
        unitCallback();
      });
  } catch (error) {
    return clb(error);
  }
}
exports.run = run;

interface ITestRunnerOptions {
  enabled?: boolean;
  relativeCoverageDir: string;
  relativeSourcePath: string;
  ignorePatterns: string[];
  includePid?: boolean;
  reports?: string[];
  verbose?: boolean;
}

class CoverageRunner {

  private coverageVar: string = '$$cov_' + new Date().getTime() + '$$';
  private transformer: any = undefined;
  private matchFn: any = undefined;
  private instrumenter: any = undefined;

  constructor(private options: ITestRunnerOptions, private testsRoot: string) {
    if (!options.relativeSourcePath) {
      return;
    }
  }

  public setupCoverage(): void {
    console.log(`Setting up coverage runner`);
    // Set up Code Coverage, hooking require so that instrumented code is returned
    const self = this;
    self.instrumenter = new istanbul.Instrumenter({ coverageVariable: self.coverageVar });
    const sourceRoot = paths.join(self.testsRoot, self.options.relativeSourcePath);

    // Glob source files
    const srcFiles = glob.sync('**/**.js', {
      cwd: sourceRoot,
      ignore: self.options.ignorePatterns,
    });

    // Create a match function - taken from the run-with-cover.js in istanbul.
    const decache = require('decache');
    const fileMap: any = {};
    srcFiles.forEach((file) => {
      const fullPath = paths.join(sourceRoot, file);
      fileMap[fullPath] = true;

      // On Windows, extension is loaded pre-test hooks and this mean we lose
      // our chance to hook the Require call. In order to instrument the code
      // we have to decache the JS file so on next load it gets instrumented.
      // This doesn't impact tests, but is a concern if we had some integration
      // tests that relied on VSCode accessing our module since there could be
      // some shared global state that we lose.
      decache(fullPath);
    });

    self.matchFn = (file: string): boolean => fileMap[file];
    self.matchFn.files = Object.keys(fileMap);

    // Hook up to the Require function so that when this is called, if any of our source files
    // are required, the instrumented version is pulled in instead. These instrumented versions
    // write to a global coverage variable with hit counts whenever they are accessed
    self.transformer = self.instrumenter.instrumentSync.bind(self.instrumenter);
    const hookOpts = { verbose: false, extensions: ['.js'] };
    istanbul.hook.hookRequire(self.matchFn, self.transformer, hookOpts);

    // initialize the global variable to stop mocha from complaining about leaks
    global[self.coverageVar] = {};

    // Hook the process exit event to handle reporting
    // Only report coverage if the process is exiting successfully
    process.on('exit', (code: number) => {
      console.log(`Exit caught`);
      self.reportCoverage();
      process.exitCode = code;
    });
  }

  /**
   * Writes a coverage report.
   * Note that as this is called in the process exit callback, all calls must be synchronous.
   *
   * @returns {void}
   *
   * @memberOf CoverageRunner
   */
  public reportCoverage(): void {
    console.log(`Generating code coverage report...`);
    const self = this;
    istanbul.hook.unhookRequire();
    let cov: any;
    if (typeof global[self.coverageVar] === 'undefined' || Object.keys(global[self.coverageVar]).length === 0) {
      console.error('No coverage information was collected, exit without writing coverage information');
      return;
    }
    cov = global[self.coverageVar];

    // TODO consider putting this under a conditional flag
    // Files that are not touched by code ran by the test runner is manually instrumented, to
    // illustrate the missing coverage.
    self.matchFn.files.forEach((file: any) => {
      if (cov[file]) {
        return;
      }
      self.transformer(fs.readFileSync(file, 'utf-8'), file);

      // When instrumenting the code, istanbul will give each FunctionDeclaration a value of 1 in coverState.s,
      // presumably to compensate for function hoisting. We need to reset this, as the function was not hoisted,
      // as it was never loaded.
      Object.keys(self.instrumenter.coverState.s).forEach((key) => {
        self.instrumenter.coverState.s[key] = 0;
      });

      cov[file] = self.instrumenter.coverState;
    });

    // TODO Allow config of reporting directory with
    const reportingDir = paths.join(self.testsRoot, self.options.relativeCoverageDir);
    const includePid = self.options.includePid;
    const pidExt = includePid ? ('-' + process.pid) : '';
    const coverageFile = paths.resolve(reportingDir, 'coverage' + pidExt + '.json');

    // yes, do this again since some test runners could clean the dir initially created
    _mkDirIfExists(reportingDir);

    fs.writeFileSync(coverageFile, JSON.stringify(cov), 'utf8');

    const remappedCollector = remapIstanbul.remap(cov, {
      warn: (warning: any) => {
        // We expect some warnings as any JS file without a typescript mapping will cause this.
        // By default, we'll skip printing these to the console as it clutters it up
        if (self.options.verbose) {
          console.warn(warning);
        }
      },
    });

    const reporter = new istanbul.Reporter(undefined, reportingDir);
    const reportTypes = (self.options.reports instanceof Array) ? self.options.reports : ['lcov'];
    reporter.addAll(reportTypes);
    reporter.write(remappedCollector, true, () => {
      console.log(`reports written to ${reportingDir}`);
    });
  }
}
