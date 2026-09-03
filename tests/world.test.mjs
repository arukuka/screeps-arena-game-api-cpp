import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { beginTick, endTick } from '../sim/engine.mjs';
import { arenaInfo } from '../sim/game/index.mjs';
import * as constants from '../sim/game/constants.mjs';
import * as prototypes from '../sim/game/prototypes.mjs';
import * as utils from '../sim/game/utils.mjs';
import { Visual } from '../sim/game/visual.mjs';
import { DEFAULT_ARENA_INFO, World, setWorld } from '../sim/index.mjs';

const bind = (world) => {
  setWorld(world);
  return world;
};

describe('simulated game API', () => {
  it('numbers ticks from 1, as the Arena does', () => {
    const world = bind(new World());

    assert.equal(utils.getTicks(), 1);
    endTick(world);
    assert.equal(utils.getTicks(), 2);
  });

  it('counts API calls for CPU accounting', () => {
    const world = bind(new World());

    utils.getTicks();
    utils.getObjects();

    assert.equal(world.apiCalls.getTicks, 1);
    assert.equal(world.apiCalls.getObjects, 1);
  });

  it('exposes arenaInfo of whichever world is bound', () => {
    bind(new World({ arenaInfo: { name: 'Test Arena', ticksLimit: 10 } }));

    assert.equal(arenaInfo.name, 'Test Arena');
    assert.equal(arenaInfo.ticksLimit, 10);
    assert.equal(arenaInfo.cpuTimeLimit, DEFAULT_ARENA_INFO.cpuTimeLimit);
  });

  it('returns objects wrapped in the prototype the bot expects', () => {
    const world = bind(new World());
    world.addCreep({ id: 'c1', my: true, x: 1, y: 1, body: ['move'] });
    world.addSpawn({ id: 'sp1', my: true, x: 4, y: 4 });

    const creeps = utils.getObjectsByPrototype(prototypes.Creep);
    const spawns = utils.getObjectsByPrototype(prototypes.StructureSpawn);

    assert.equal(creeps.length, 1);
    assert.ok(creeps[0] instanceof prototypes.Creep);
    assert.equal(creeps[0].id, 'c1');
    assert.equal(spawns[0].store.energy, constants.SPAWN_ENERGY_CAPACITY);
  });

  it('reports 0, not undefined, for a resource a store lacks', () => {
    const world = bind(new World());
    world.addCreep({ id: 'c1', my: true, body: ['carry'] });

    const [creep] = utils.getObjectsByPrototype(prototypes.Creep);

    assert.equal(creep.store.energy, 0);
    assert.equal(creep.store.getFreeCapacity(), constants.CARRY_CAPACITY);
  });

  it('finds a path around a wall', () => {
    const world = bind(new World({ width: 10, height: 10 }));
    world.fillTerrain(3, 0, 3, 8, constants.TERRAIN_WALL);

    const path = utils.findPath({ x: 1, y: 4 }, { x: 5, y: 4 });

    assert.ok(path.length > 0, 'expected a route around the wall');
    assert.ok(
      path.every((step) => world.getTerrainAt(step.x, step.y) !== constants.TERRAIN_WALL),
      'path must not cross the wall',
    );
    assert.deepEqual(path.at(-1), { x: 5, y: 4 });
  });

  it('reports an unreachable goal as incomplete', () => {
    const world = bind(new World({ width: 10, height: 10 }));
    world.fillTerrain(3, 0, 3, 9, constants.TERRAIN_WALL);

    const result = utils.findPath({ x: 1, y: 4 }, { x: 5, y: 4 });

    assert.deepEqual(result, []);
  });

  it('records visuals instead of drawing them', () => {
    const world = bind(new World());
    beginTick(world);

    new Visual(1).circle({ x: 2, y: 3 }, { fill: '#ff0000' });

    assert.equal(world.visuals.length, 1);
    assert.equal(world.visuals[0].op, 'circle');
    assert.deepEqual(world.visuals[0].pos, { x: 2, y: 3 });
  });

  it('reports when the tick limit is exhausted', () => {
    const world = bind(new World({ arenaInfo: { ticksLimit: 2 } }));

    assert.equal(world.finished, false);
    endTick(world);
    assert.equal(world.finished, false);
    endTick(world);
    assert.equal(world.finished, true);
  });
});
