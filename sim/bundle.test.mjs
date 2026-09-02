/**
 * Tests the artifact that actually gets deployed.
 *
 * `harness.test.mjs` runs the bot the way development does, importing the
 * pieces separately. This one loads `dist/main.mjs` — the single bundled file
 * copied into the Arena source folder — and satisfies its `game/utils` import
 * with the simulator, which is the closest a local test can get to the real
 * runtime.
 */

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, before, after } from 'node:test';

import { setWorld } from './game/_current.mjs';
import { World } from './world.mjs';

const BUNDLE = new URL('../dist/main.mjs', import.meta.url);
const SIM_UTILS = new URL('./game/utils.mjs', import.meta.url).href;

describe('deployable bundle', { skip: existsSync(BUNDLE) ? false : 'run `npm run bundle` first' }, () => {
  let hooks;
  let lines;
  let originalLog;

  before(() => {
    // Stands in for the Arena runtime, which resolves bare `game/*` specifiers
    // to its own built-in modules.
    hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === 'game/utils') {
          return { url: SIM_UTILS, shortCircuit: true };
        }
        return next(specifier, context);
      },
    });

    // The bundle logs through `console.log`, the same as it will in the Arena.
    lines = [];
    originalLog = console.log;
    console.log = (text) => lines.push(text);
  });

  after(() => {
    console.log = originalLog;
    hooks?.deregister();
  });

  it('is pure ASCII, so no transport can mangle the embedded WASM', () => {
    // The bundle travels client -> jszip -> upload -> server -> isolated-vm,
    // and nothing in that chain promises to preserve bytes that are not ASCII.
    // Emscripten's default single-file encoding produces exactly such bytes and
    // documents the requirement; `-sSINGLE_FILE_BINARY_ENCODE=0` avoids it.
    // One corrupted byte is a WebAssembly.CompileError at startup, so this is
    // worth asserting rather than trusting.
    const bytes = readFileSync(BUNDLE);
    const offending = [];

    for (const [index, byte] of bytes.entries()) {
      const isText = byte === 0x09 || byte === 0x0a || byte === 0x0d;
      if (byte > 0x7e || (byte < 0x20 && !isText)) {
        offending.push(`0x${byte.toString(16)} at ${index}`);
      }
    }

    assert.deepEqual(offending, [], 'dist/main.mjs must contain only ASCII');
  });

  it('exports loop() and drives the C++ bot', async () => {
    const world = new World();
    setWorld(world);

    // Import inside the test: the bundle instantiates the WASM at module scope,
    // so a world has to be bound before this line runs.
    const { loop } = await import(BUNDLE.href);

    assert.equal(typeof loop, 'function');

    for (let tick = 0; tick < 3; tick += 1) {
      loop();
      world.advance();
    }

    assert.deepEqual(lines, [
      'tick 1 (loop #1, previous 0)',
      'tick 2 (loop #2, previous 1)',
      'tick 3 (loop #3, previous 2)',
    ]);
    assert.equal(world.apiCalls.getTicks, 3);
  });
});
