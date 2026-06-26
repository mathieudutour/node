'use strict';

const common = require('../common');
const tmpdir = require('../common/tmpdir');
const assert = require('assert');
const { spawnSync } = require('child_process');

tmpdir.refresh();
const workerPath = tmpdir.resolve('worker.cjs');

const result = spawnSync(process.execPath, ['-e', `
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { Worker } = require('worker_threads');

assert.strictEqual(
  new vm.Script('//# sourceMappingURL=small.map').sourceMapURL,
  'small.map');
assert.strictEqual(
  new vm.Script(
    '//# sourceMappingURL=data:application/json;base64,' +
    'A'.repeat(24 * 1024 * 1024)).sourceMapURL,
  undefined);

fs.writeFileSync(process.env.WORKER_PATH, [
  'const { parentPort } = require("worker_threads");',
  'parentPort.postMessage("loaded");',
  'parentPort.close();',
  '//# sourceMappingURL=data:application/json;base64,' + 'A'.repeat(24 * 1024 * 1024),
].join('\\n'));

let receivedOOM = false;
const worker = new Worker(process.env.WORKER_PATH, {
  resourceLimits: { maxOldGenerationSizeMb: 16 },
});

worker.on('message', (message) => {
  assert.notStrictEqual(message, 'loaded');
});
worker.on('error', (error) => {
  assert.strictEqual(error.code, 'ERR_WORKER_OUT_OF_MEMORY');
  assert.strictEqual(
    error.message,
    'Worker terminated due to reaching memory limit: JS heap out of memory');
  receivedOOM = true;
});
worker.on('exit', (code) => {
  process.exit(receivedOOM && code === 1 ? 0 : 1);
});
`], {
  encoding: 'utf8',
  env: { ...process.env, WORKER_PATH: workerPath },
  timeout: common.platformTimeout(30_000),
});

assert.strictEqual(result.signal, null);
assert.strictEqual(result.status, 0, result.stderr);
assert.strictEqual(result.stderr, '');
