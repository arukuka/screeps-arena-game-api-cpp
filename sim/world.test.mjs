import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { setWorld } from './game/_current.mjs';
import { arenaInfo } from './game/index.mjs';
import { getTicks } from './game/utils.mjs';
import { DEFAULT_ARENA_INFO, World } from './world.mjs';

describe('simulated game API', () => {
  it('numbers ticks from 1, as the Arena does', () => {
    const world = new World();
    setWorld(world);

    assert.equal(getTicks(), 1);
    world.advance();
    assert.equal(getTicks(), 2);
  });

  it('counts API calls for CPU accounting', () => {
    const world = new World();
    setWorld(world);

    getTicks();
    getTicks();

    assert.equal(world.apiCalls.getTicks, 2);
  });

  it('exposes arenaInfo of whichever world is bound', () => {
    setWorld(new World({ arenaInfo: { name: 'Test Arena', ticksLimit: 10 } }));

    assert.equal(arenaInfo.name, 'Test Arena');
    assert.equal(arenaInfo.ticksLimit, 10);
    assert.equal(arenaInfo.cpuTimeLimit, DEFAULT_ARENA_INFO.cpuTimeLimit);
  });

  it('reports when the tick limit is exhausted', () => {
    const world = new World({ arenaInfo: { ticksLimit: 2 } });

    assert.equal(world.finished, false);
    world.advance();
    assert.equal(world.finished, false);
    world.advance();
    assert.equal(world.finished, true);
  });
});
