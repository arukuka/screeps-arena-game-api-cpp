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
/** The `game/*` specifiers the bundle imports, mapped onto the simulator. */
const SIM_MODULES = {
  game: new URL('../../sim/game/index.mjs', import.meta.url).href,
  'game/utils': new URL('../../sim/game/utils.mjs', import.meta.url).href,
  'game/prototypes': new URL('../../sim/game/prototypes.mjs', import.meta.url).href,
  'game/constants': new URL('../../sim/game/constants.mjs', import.meta.url).href,
  'game/path-finder': new URL('../../sim/game/path-finder.mjs', import.meta.url).href,
  'game/visual': new URL('../../sim/game/visual.mjs', import.meta.url).href,
};

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

    // These assertions only confirm the suites actually ran: a non-zero exit
    // would already have thrown out of run(). Keep them loose about wording,
    // because both tools below phrase their summary differently depending on
    // the version installed, and pinning either phrasing means a green local
    // run and a red CI one.
    //
    // ctest swallows the executable's own stdout, so its verdict is all there
    // is. CMake 3.28 says "100% tests passed, 0 tests failed out of 1";
    // CMake 4.x drops the middle clause.
    assert.match(output, /100% tests passed(?:, 0 tests failed)? out of [1-9]\d*/, output);

    // ...and on the template's own sim suite, which drives the compiled WASM.
    assert.match(output, /reads the game through the WASM boundary/, output);

    // `node --test` picks its reporter by Node version when stdout is not a
    // TTY: TAP ("# fail 0") through Node 22, spec ("i fail 0") from Node 24.
    // Accept either, rather than pinning a reporter in the template to suit
    // this test.
    assert.match(output, /^(?:\u2139|#) fail 0$/m, output);
    assert.match(output, /^(?:\u2139|#) pass [1-9]\d*$/m, output);
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

    // MPL section 3.1 asks that recipients be told the Source Code Form is
    // under the MPL and where to get it. `arenaBundle()` emits that as a
    // banner, so a bot author satisfies it without having to know it exists.
    const text = bundle.toString('utf8');
    assert.match(text, /Mozilla Public License, v\. 2\.0/, 'missing MPL notice');
    assert.match(text, /github\.com\/arukuka\/screeps-arena-game-api-cpp/,
      'the notice must say where to get the source');
  });

  it('runs the bundled artifact against the simulator', async () => {
    const { setWorld, World } = await import('../../sim/index.mjs');
    const { beginTick, endTick } = await import('../../sim/engine.mjs');

    // Stands in for the Arena runtime, which resolves bare `game/*` specifiers
    // to its own built-in modules.
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        const simulated = SIM_MODULES[specifier];
        return simulated === undefined
          ? next(specifier, context)
          : { url: simulated, shortCircuit: true };
      },
    });

    const lines = [];
    const originalLog = console.log;
    console.log = (text) => lines.push(text);

    try {
      const world = new World({ width: 20, height: 20 });
      world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: ['move', 'work', 'carry'] });
      world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });
      setWorld(world);

      // Imported inside the test: the bundle instantiates the WASM at module
      // scope, so a world has to be bound first.
      const { loop } = await import(join(project, 'dist', 'main.mjs'));

      for (let tick = 0; tick < 3; tick += 1) {
        beginTick(world);
        loop();
        endTick(world);
      }

      assert.deepEqual(lines, [
        'tick 1: 1 creeps, 1 harvests so far',
        'tick 2: 1 creeps, 2 harvests so far',
        'tick 3: 1 creeps, 3 harvests so far',
      ]);
    } finally {
      console.log = originalLog;
      hooks.deregister();
    }
  });
});
