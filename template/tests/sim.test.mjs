/**
 * End-to-end: the compiled WASM driven through the simulated game API.
 *
 * The native tests in bot_test.cc cover the logic; this covers the bridge --
 * that C++ really reaches `game/utils` and that the heap survives between ticks.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { World, createMatch } from 'screeps-arena-game-api-cpp/sim';

import createArenaBot from '../dist/wasm/bot.mjs';

describe('bot', () => {
  it('reads the tick counter through the WASM boundary', () => {
    const world = new World();
    const match = createMatch({ createArenaBot, world });

    match.run(3);

    assert.equal(world.apiCalls.getTicks, 3);
    assert.deepEqual(match.logs, [
      'hello from C++: tick 1 (loop #1)',
      'hello from C++: tick 2 (loop #2)',
      'hello from C++: tick 3 (loop #3)',
    ]);
  });

  it('keeps C++ state across ticks', () => {
    const match = createMatch({ createArenaBot });

    match.run(5);

    // The loop counter is only right if the WASM heap survived between calls.
    assert.equal(match.logs.at(-1), 'hello from C++: tick 5 (loop #5)');
  });
});
