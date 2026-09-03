/**
 * End-to-end: the compiled WASM driven through the simulated game API.
 *
 * The native tests in bot_test.cc cover logic that needs no game objects; this
 * covers the bridge -- that C++ really reaches `game/*` and that the heap
 * survives between ticks.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { World, createMatch } from 'screeps-arena-game-api-cpp/sim';

import createArenaBot from '../dist/wasm/bot.mjs';

/** A creep one step away from a source. */
function harvestWorld() {
  const world = new World({ width: 20, height: 20 });
  world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: ['move', 'work', 'carry'] });
  world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });
  return world;
}

describe('bot', () => {
  it('reads the game through the WASM boundary', () => {
    const world = harvestWorld();
    const match = createMatch({ createArenaBot, world });

    match.run(1);

    assert.equal(world.apiCalls.getTicks, 1);
    assert.equal(world.apiCalls.getObjectsByPrototype, 2, 'creeps and sources');
    assert.equal(match.logs[0], 'tick 1: 1 creeps, 1 harvests so far');
  });

  it('harvests through the simulated engine', () => {
    const world = harvestWorld();
    const match = createMatch({ createArenaBot, world });

    match.run(3);

    // 1 WORK part * HARVEST_POWER, three times.
    assert.equal(world.creep('c1').store.energy, 6);
  });

  it('walks to a source that is out of reach', () => {
    const world = new World({ width: 20, height: 20 });
    world.addCreep({ id: 'c1', my: true, x: 1, y: 5, body: ['move', 'work', 'carry'] });
    world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });

    const match = createMatch({ createArenaBot, world });

    // [move, work, carry] carries two non-move parts, so it gains 4 fatigue per
    // step and recovers 2 a tick: one square every other tick, five to go.
    match.run(12);

    assert.equal(world.creep('c1').x, 5, 'should have walked adjacent to the source');
    assert.ok(world.creep('c1').store.energy > 0, 'and started harvesting');
  });

  it('keeps C++ state across ticks', () => {
    const match = createMatch({ createArenaBot, world: harvestWorld() });

    match.run(4);

    // The running total is only right if the WASM heap survived between calls.
    assert.equal(match.logs.at(-1), 'tick 4: 1 creeps, 4 harvests so far');
  });
});
