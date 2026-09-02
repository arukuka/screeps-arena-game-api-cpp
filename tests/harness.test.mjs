/**
 * End-to-end tests: real compiled WASM, simulated game API.
 *
 * These are the tests that prove the bridge works. The C++ logic itself is
 * covered natively in `tests/`, which needs no build of this module at all.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { World, createMatch } from '../sim/index.mjs';

import createArenaBot from '../build/fixtures/probe_bot.mjs';

describe('WASM bot against the simulator', () => {
  it('reads getTicks() through the WASM boundary', () => {
    const world = new World();
    const match = createMatch({ createArenaBot, world });

    match.run(3);

    assert.equal(world.apiCalls.getTicks, 3, 'C++ should call getTicks once per tick');
  });

  it('observes the simulated tick counter, starting at 1', () => {
    const match = createMatch({ createArenaBot });

    match.run(3);

    assert.deepEqual(match.logs, [
      'tick 1 (loop #1, previous 0)',
      'tick 2 (loop #2, previous 1)',
      'tick 3 (loop #3, previous 2)',
    ]);
  });

  it('keeps C++ heap state across ticks', () => {
    const match = createMatch({ createArenaBot });

    match.run(5);

    // `previous` is only correct if the C++ globals survived between calls.
    assert.equal(match.logs.at(-1), 'tick 5 (loop #5, previous 4)');
  });

  it('gives each match an isolated WASM instance', () => {
    const first = createMatch({ createArenaBot });
    first.run(2);

    const second = createMatch({ createArenaBot });
    second.run(1);

    assert.equal(second.logs[0], 'tick 1 (loop #1, previous 0)');
    assert.equal(first.logs.length, 2, 'the first match must not be disturbed');
  });

  // The Arena's console implements log() and little else, and Emscripten's
  // preamble binds console.error before any Module override applies. Node's
  // console has everything, so without these two the gap only shows up on
  // deploy -- as a TypeError with no obvious connection to the console.
  const withConsole = (stub, body) => {
    const original = globalThis.console;
    globalThis.console = stub;
    try {
      body();
    } finally {
      globalThis.console = original;
    }
  };

  it('starts on a runtime whose console only implements log()', () => {
    const log = globalThis.console.log.bind(globalThis.console);

    withConsole({ log }, () => {
      const match = createMatch({ createArenaBot });
      match.run(1);

      assert.equal(match.logs[0], 'tick 1 (loop #1, previous 0)');
    });
  });

  it('starts on a runtime whose console is frozen and incomplete', () => {
    const log = globalThis.console.log.bind(globalThis.console);

    withConsole(Object.freeze({ log }), () => {
      const match = createMatch({ createArenaBot });
      match.run(1);

      assert.equal(match.logs[0], 'tick 1 (loop #1, previous 0)');
    });
  });

  it('interleaves two matches without mixing up their worlds', () => {
    const slow = createMatch({ createArenaBot, world: new World() });
    const fast = createMatch({ createArenaBot, world: new World() });

    fast.run(4);
    slow.runTick();

    assert.equal(slow.logs[0], 'tick 1 (loop #1, previous 0)');
    assert.equal(fast.logs.at(-1), 'tick 4 (loop #4, previous 3)');
  });
});
