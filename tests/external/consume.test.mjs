/**
 * Proves the library is usable from outside: packs it exactly as npm would
 * publish it, installs that tarball into a copy of `template/`, and builds and
 * runs the result.
 *
 * This is the only test that can catch a `files` list missing a header, an
 * `exports` entry that does not resolve, or a CMake helper that only works from
 * inside this repo -- none of which the in-repo tests would notice.
 *
 * `template/` is the fixture *and* the published starting point, so the
 * template cannot rot: if it stops building, this test fails.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const SIM_UTILS = new URL('../../sim/game/utils.mjs', import.meta.url).href;

// Emscripten builds and an npm install; nowhere near the default 30s.
const TIMEOUT_MS = 10 * 60 * 1000;

let workspace;
let project;

// Node's test runner marks subprocesses with NODE_TEST_CONTEXT, and a nested
// `node --test` sees it and skips running any files ("run() is being called
// recursively"). The consumer project runs its own suite, so drop the marker.
const { NODE_TEST_CONTEXT: _ignored, ...CHILD_ENV } = process.env;

/**
 * Runs a shell command inside the consumer project.
 *
 * Wrapped in the library's own `with-emsdk.sh` (invoked from the repo root, so
 * it finds the SDK there) rather than duplicating the SDK lookup here.
 */
function run(command) {
  return execFileSync(
    'bash',
    ['-c', `scripts/with-emsdk.sh bash -c 'cd "${project}" && ${command}' 2>&1`],
    { cwd: REPO, encoding: 'utf8', env: CHILD_ENV, maxBuffer: 32 * 1024 * 1024 },
  );
}

describe('consuming the published package', { timeout: TIMEOUT_MS }, () => {
  before(() => {
    workspace = mkdtempSync(join(tmpdir(), 'arena-cpp-consume-'));
    project = join(workspace, 'bot');

    // 1. Pack the library exactly as `npm publish` would.
    const packed = execFileSync(
      'npm',
      ['pack', '--pack-destination', workspace, '--silent'],
      { cwd: REPO, encoding: 'utf8' },
    ).trim().split('\n').at(-1);
    const tarball = join(workspace, packed);

    // 2. Copy the template and point it at that tarball instead of GitHub.
    cpSync(join(REPO, 'template'), project, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8'));
    manifest.dependencies['screeps-arena-game-api-cpp'] = `file:${tarball}`;
    writeFileSync(join(project, 'package.json'), JSON.stringify(manifest, null, 2));

    // 3. Install, which is also where a broken `bin` or `exports` shows up.
    run('npm install --no-audit --no-fund --loglevel=error');
  });

  after(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  it('builds the bot and passes the template test suite', () => {
    // Exercises arena_add_bot() from a project that only sees node_modules,
    // plus the native tests, which link arena::testing rather than the bridge.
    const output = run('npm test');

    // ctest swallows the executable's own stdout, so assert on its verdict.
    assert.match(output, /100% tests passed out of 1/, output);

    // ...and on the template's own sim suite, which drives the compiled WASM.
    assert.match(output, /reads the tick counter through the WASM boundary/, output);
    assert.match(output, /^\u2139 fail 0$/m, output);
  });

  it('bundles to a deployable, pure-ASCII main.mjs', () => {
    run('npm run bundle');

    const bundle = readFileSync(join(project, 'dist', 'main.mjs'));
    const offending = [];

    for (const [index, byte] of bundle.entries()) {
      const isText = byte === 0x09 || byte === 0x0a || byte === 0x0d;
      if (byte > 0x7e || (byte < 0x20 && !isText)) {
        offending.push(`0x${byte.toString(16)} at ${index}`);
      }
    }

    // Nothing between here and the Arena promises to preserve non-ASCII bytes,
    // and one mangled byte is a WebAssembly.CompileError at startup.
    assert.deepEqual(offending, [], 'dist/main.mjs must contain only ASCII');
  });

  it('runs the bundled artifact against the simulator', async () => {
    const { setWorld } = await import('../../sim/index.mjs');
    const { World } = await import('../../sim/world.mjs');

    // Stands in for the Arena runtime, which resolves bare `game/*` specifiers
    // to its own built-in modules.
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        return specifier === 'game/utils'
          ? { url: SIM_UTILS, shortCircuit: true }
          : next(specifier, context);
      },
    });

    const lines = [];
    const originalLog = console.log;
    console.log = (text) => lines.push(text);

    try {
      const world = new World();
      setWorld(world);

      // Imported inside the test: the bundle instantiates the WASM at module
      // scope, so a world has to be bound first.
      const { loop } = await import(join(project, 'dist', 'main.mjs'));

      for (let tick = 0; tick < 3; tick += 1) {
        loop();
        world.advance();
      }

      assert.deepEqual(lines, [
        'hello from C++: tick 1 (loop #1)',
        'hello from C++: tick 2 (loop #2)',
        'hello from C++: tick 3 (loop #3)',
      ]);
    } finally {
      console.log = originalLog;
      hooks.deregister();
    }
  });
});
