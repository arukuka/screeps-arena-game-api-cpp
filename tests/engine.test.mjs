/**
 * The simulator's engine.
 *
 * These pin the rules the engine claims to implement. Where a rule came from a
 * measurement rather than from the typings, the test says so -- if a future
 * measurement disagrees, this is the place to change.
 *
 * Read `sim/FIDELITY.md` before trusting any of it: an approximation that
 * passes its own tests is still an approximation.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { beginTick, endTick } from '../sim/engine.mjs';
import * as C from '../sim/game/constants.mjs';
import * as prototypes from '../sim/game/prototypes.mjs';
import * as utils from '../sim/game/utils.mjs';
import { World, setWorld } from '../sim/index.mjs';

/** Runs one tick, letting `act(api)` stand in for the bot. */
function tick(world, act) {
  setWorld(world);
  beginTick(world);
  act({ utils, prototypes });
  endTick(world);
}

const only = (world, Prototype) => utils.getObjectsByPrototype(Prototype)[0];

describe('movement', () => {
  it('charges fatigue for the tile entered, not the one left', () => {
    const world = new World({ width: 10, height: 10 });
    world.setTerrainAt(6, 5, C.TERRAIN_SWAMP);
    world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: [C.MOVE, C.ATTACK] });

    tick(world, () => only(world, prototypes.Creep).move(C.RIGHT));

    // 2 per weight * 1 non-move part * swamp 5 = 10, less 2 recovered next tick.
    assert.deepEqual(
      { x: world.creep('c1').x, fatigue: world.creep('c1').fatigue },
      { x: 6, fatigue: 10 },
    );
  });

  it('refuses to move a tired creep', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: [C.MOVE], fatigue: 4 });

    let result;
    // Two ticks of recovery at 2 per MOVE part still leaves it tired on the first.
    tick(world, () => { result = only(world, prototypes.Creep).move(C.RIGHT); });

    assert.equal(result, C.ERR_TIRED);
    assert.equal(world.creep('c1').x, 5);
  });

  it('does not walk into terrain walls', () => {
    const world = new World({ width: 10, height: 10 });
    world.setTerrainAt(6, 5, C.TERRAIN_WALL);
    world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: [C.MOVE] });

    tick(world, () => only(world, prototypes.Creep).move(C.RIGHT));

    assert.equal(world.creep('c1').x, 5);
  });

  it('leaves both creeps in place when they want the same tile', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'a', my: true, x: 4, y: 5, body: [C.MOVE] });
    world.addCreep({ id: 'b', my: true, x: 6, y: 5, body: [C.MOVE] });

    tick(world, () => {
      const creeps = utils.getObjectsByPrototype(prototypes.Creep);
      creeps.find((c) => c.id === 'a').move(C.RIGHT);
      creeps.find((c) => c.id === 'b').move(C.LEFT);
    });

    assert.equal(world.creep('a').x, 4);
    assert.equal(world.creep('b').x, 6);
  });
});

describe('combat', () => {
  it('applies melee damage per ATTACK part', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'me', my: true, x: 5, y: 5, body: [C.ATTACK, C.ATTACK] });
    world.addCreep({ id: 'foe', my: false, x: 6, y: 5, body: new Array(10).fill(C.TOUGH) });

    tick(world, () => {
      const creeps = utils.getObjectsByPrototype(prototypes.Creep);
      const me = creeps.find((c) => c.id === 'me');
      me.attack(creeps.find((c) => c.id === 'foe'));
    });

    assert.equal(world.creep('foe').hits, 1000 - 2 * C.ATTACK_POWER);
  });

  it('does not fall off with range for rangedAttack (measured)', () => {
    const build = (distance) => {
      const world = new World({ width: 20, height: 10 });
      world.addCreep({ id: 'me', my: true, x: 5, y: 5, body: [C.RANGED_ATTACK] });
      world.addCreep({
        id: 'foe', my: false, x: 5 + distance, y: 5, body: new Array(10).fill(C.TOUGH),
      });
      tick(world, () => {
        const creeps = utils.getObjectsByPrototype(prototypes.Creep);
        creeps.find((c) => c.id === 'me').rangedAttack(creeps.find((c) => c.id === 'foe'));
      });
      return 1000 - world.creep('foe').hits;
    };

    assert.deepEqual([build(1), build(2), build(3)],
      [C.RANGED_ATTACK_POWER, C.RANGED_ATTACK_POWER, C.RANGED_ATTACK_POWER]);
  });

  it('does fall off with range for rangedMassAttack (measured 10 / 4 / 1)', () => {
    const world = new World({ width: 20, height: 10 });
    world.addCreep({ id: 'me', my: true, x: 5, y: 5, body: [C.RANGED_ATTACK] });
    for (const distance of [1, 2, 3]) {
      world.addCreep({
        id: `foe${distance}`, my: false, x: 5 + distance, y: 5,
        body: new Array(10).fill(C.TOUGH),
      });
    }

    tick(world, () => only(world, prototypes.Creep).rangedMassAttack());

    assert.deepEqual(
      [1, 2, 3].map((d) => 1000 - world.creep(`foe${d}`).hits),
      [10, 4, 1],
    );
  });

  it('destroys body parts as a creep loses hits', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'me', my: true, x: 5, y: 5, body: [C.ATTACK] });
    world.addCreep({ id: 'foe', my: false, x: 6, y: 5, body: [C.TOUGH, C.TOUGH, C.MOVE] });

    tick(world, () => {
      const creeps = utils.getObjectsByPrototype(prototypes.Creep);
      creeps.find((c) => c.id === 'me').attack(creeps.find((c) => c.id === 'foe'));
    });

    // 30 damage off 300 hits: the last part loses 30 and the rest are intact.
    assert.deepEqual(world.creep('foe').body.map((p) => p.hits), [100, 100, 70]);
  });

  it('removes a creep that runs out of hits', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'me', my: true, x: 5, y: 5, body: [C.ATTACK] });
    world.addCreep({ id: 'foe', my: false, x: 6, y: 5, body: [C.MOVE], hits: 10 });

    tick(world, () => {
      const creeps = utils.getObjectsByPrototype(prototypes.Creep);
      creeps.find((c) => c.id === 'me').attack(creeps.find((c) => c.id === 'foe'));
    });

    assert.equal(world.byId('foe'), undefined);
  });
});

describe('work', () => {
  it('harvests HARVEST_POWER per WORK part', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: [C.WORK, C.WORK, C.CARRY] });
    world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });

    tick(world, () => {
      const creep = only(world, prototypes.Creep);
      creep.harvest(only(world, prototypes.Source));
    });

    assert.equal(world.creep('c1').store.energy, 2 * C.HARVEST_POWER);
  });

  it('moves energy between stores on transfer', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: [C.CARRY], store: { energy: 50 } });
    world.addExtension({ id: 'e1', my: true, x: 6, y: 5 });

    tick(world, () => {
      const creep = only(world, prototypes.Creep);
      creep.transfer(only(world, prototypes.StructureExtension));
    });

    assert.equal(world.creep('c1').store.energy, 0);
    assert.equal(world.byId('e1').store.energy, 50);
  });

  it('drops a pile that another creep can pick up', () => {
    const world = new World({ width: 10, height: 10 });
    world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: [C.CARRY], store: { energy: 30 } });

    tick(world, () => only(world, prototypes.Creep).drop());

    const pile = world.ofType('resource')[0];
    assert.equal(pile.amount, 30);
    assert.deepEqual({ x: pile.x, y: pile.y }, { x: 5, y: 5 });
  });
});

describe('spawning', () => {
  it('spends energy and produces a creep after CREEP_SPAWN_TIME per part', () => {
    const world = new World({ width: 10, height: 10 });
    // Below capacity, so the regeneration is actually observable.
    world.addSpawn({ id: 'sp1', my: true, x: 5, y: 5, store: { energy: 500 } });

    const body = [C.MOVE, C.WORK];
    const cost = body.reduce((sum, part) => sum + C.BODYPART_COST[part], 0);
    const before = world.byId('sp1').store.energy;

    tick(world, () => only(world, prototypes.StructureSpawn).spawnCreep(body));

    // Regenerated 1 on the same tick, which is why the measurement needed care.
    assert.equal(world.byId('sp1').store.energy, before + C.SPAWN_ENERGY_REGEN - cost);
    assert.equal(world.ofType('creep').length, 1);
    assert.equal(world.ofType('creep')[0].spawning, true);

    for (let i = 0; i < body.length * C.CREEP_SPAWN_TIME; i += 1) {
      tick(world, () => {});
    }

    assert.equal(world.ofType('creep')[0].spawning, false);
    assert.equal(world.byId('sp1').spawning, null);
  });

  it('refuses a second creep while busy', () => {
    const world = new World({ width: 10, height: 10 });
    world.addSpawn({ id: 'sp1', my: true, x: 5, y: 5 });

    tick(world, () => only(world, prototypes.StructureSpawn).spawnCreep([C.MOVE]));

    let second;
    tick(world, () => {
      second = only(world, prototypes.StructureSpawn).spawnCreep([C.MOVE]);
    });

    assert.equal(second.error, C.ERR_BUSY);
  });
});

describe('towers', () => {
  const towerDamageAt = (distance) => {
    const world = new World({ width: 40, height: 40 });
    world.addTower({ id: 't1', my: true, x: 5, y: 5 });
    world.addCreep({
      id: 'foe', my: false, x: 5 + distance, y: 5, body: new Array(30).fill(C.TOUGH),
    });

    tick(world, () => {
      const tower = only(world, prototypes.StructureTower);
      tower.attack(only(world, prototypes.Creep));
    });

    return { world, damage: 3000 - (world.byId('foe')?.hits ?? 0) };
  };

  it('spends energy and goes on cooldown', () => {
    const { world } = towerDamageAt(1);

    assert.equal(world.byId('t1').store.energy, C.TOWER_CAPACITY - C.TOWER_ENERGY_COST);
    assert.equal(world.byId('t1').cooldown, C.TOWER_COOLDOWN);
  });

  it('deals full power at optimal range', () => {
    assert.equal(towerDamageAt(C.TOWER_OPTIMAL_RANGE).damage, C.TOWER_POWER_ATTACK);
  });

  it('falls off with distance', () => {
    // ASSUMED, not measured -- see sim/FIDELITY.md. Pinned so that a future
    // measurement shows up here as a deliberate change.
    const expected = Math.floor(C.TOWER_POWER_ATTACK * (1 - 9 / 19));

    assert.equal(towerDamageAt(10).damage, expected);
  });
});
