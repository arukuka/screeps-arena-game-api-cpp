/**
 * Resolves one tick.
 *
 * Order matters and is the main thing this file gets right or wrong:
 *
 *   1. upkeep    -- fatigue recovery, cooldowns, spawn/source regeneration
 *   2. the bot runs (elsewhere) and records intents
 *   3. movement  -- all at once, so two creeps cannot swap through each other
 *   4. combat    -- damage and healing applied from a snapshot of hits
 *   5. work      -- harvest, build, transfer, withdraw, drop, pickup
 *   6. spawning  -- progress, then the creep appears
 *   7. cleanup   -- deaths, decay, tick++
 *
 * This is an approximation. `sim/FIDELITY.md` lists what is known to differ
 * from the real engine; anything not listed there is simply untested against
 * it, which is not the same as verified.
 */

import {
  ATTACK,
  ATTACK_POWER,
  BODYPART_HITS,
  BUILD_POWER,
  CREEP_SPAWN_TIME,
  DIRECTION_DELTA,
  FATIGUE_PER_WEIGHT,
  FATIGUE_RECOVERY_PER_MOVE,
  HARVEST_POWER,
  HEAL,
  HEAL_POWER,
  MOVE,
  RANGED_ATTACK,
  RANGED_ATTACK_DISTANCE_RATE,
  RANGED_ATTACK_POWER,
  RANGED_HEAL_POWER,
  RESOURCE_ENERGY,
  SOURCE_ENERGY_REGEN,
  SPAWN_ENERGY_CAPACITY,
  SPAWN_ENERGY_REGEN,
  TERRAIN_MOVE_COST,
  TERRAIN_WALL,
  TOWER_COOLDOWN,
  TOWER_ENERGY_COST,
  TOWER_FALLOFF,
  TOWER_FALLOFF_RANGE,
  TOWER_OPTIMAL_RANGE,
  TOWER_POWER_ATTACK,
  TOWER_POWER_HEAL,
  BODYPART_COST,
  WORK,
  OBSTACLE_OBJECT_TYPES,
} from './game/constants.mjs';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const livingParts = (creep, type) =>
  (creep.body ?? []).filter((part) => part.type === type && part.hits > 0).length;

const storeTotal = (object) =>
  Object.values(object.store ?? {}).reduce((sum, amount) => sum + amount, 0);

const freeCapacity = (object) => (object.storeCapacity ?? 0) - storeTotal(object);

/**
 * Tower power after distance falloff.
 *
 * ASSUMED, NOT MEASURED. The arena defines TOWER_OPTIMAL_RANGE,
 * TOWER_FALLOFF_RANGE and TOWER_FALLOFF with exactly the names Screeps World
 * uses, so this applies World's formula to them. Three constants that plainly
 * mean something are worth modelling, but nobody has checked this against a
 * real match -- see sim/FIDELITY.md.
 */
function towerPower(base, distance) {
  if (distance <= TOWER_OPTIMAL_RANGE) return base;

  const capped = Math.min(distance, TOWER_FALLOFF_RANGE);
  const falloff =
    (TOWER_FALLOFF * (capped - TOWER_OPTIMAL_RANGE)) /
    (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
  return base * (1 - falloff);
}

/** Moves `amount` of `resource` between two stores, clamped by both sides. */
function moveResource(from, to, resource, amount) {
  const available = Math.min(amount, from.store?.[resource] ?? 0);
  const moved = Math.min(available, freeCapacity(to));
  if (moved <= 0) return 0;

  from.store[resource] -= moved;
  to.store[resource] = (to.store[resource] ?? 0) + moved;
  return moved;
}

/** Damage a creep or structure, spending creep body parts from the front. */
function damage(object, amount) {
  if (amount <= 0) return;
  object.hits = Math.max(0, (object.hits ?? 0) - amount);

  if (object.type !== 'creep') return;

  // Screeps destroys body parts as a creep loses hits, oldest first. The bot
  // sees this through `body[].hits`, and it changes what the creep can do.
  let remaining = object.hits;
  for (const part of object.body) {
    const kept = Math.min(BODYPART_HITS, remaining);
    part.hits = kept;
    remaining -= kept;
  }
}

function blocked(world, x, y, mover) {
  if (!world.inBounds(x, y)) return true;
  if (world.getTerrainAt(x, y) === TERRAIN_WALL) return true;

  return world.at(x, y).some((object) => {
    if (object === mover) return false;
    if (!OBSTACLE_OBJECT_TYPES.includes(object.type)) {
      // A hostile rampart blocks; your own does not.
      return object.type === 'rampart' && object.my !== mover.my;
    }
    return true;
  });
}

/** One step of a greedy path toward a target, ignoring nothing but obstacles. */
function stepToward(world, creep, target) {
  const dx = Math.sign(target.x - creep.x);
  const dy = Math.sign(target.y - creep.y);

  // Straight line first, then relax one axis at a time. Not A*: the bot is
  // expected to use `searchPath` when the route matters.
  for (const [ox, oy] of [[dx, dy], [dx, 0], [0, dy]]) {
    if (ox === 0 && oy === 0) continue;
    if (!blocked(world, creep.x + ox, creep.y + oy, creep)) {
      return { x: creep.x + ox, y: creep.y + oy };
    }
  }
  return null;
}

function applyMoves(world, intents) {
  const requests = new Map();

  for (const intent of intents) {
    const creep = world.byId(intent.id);
    if (creep === undefined || creep.fatigue > 0) continue;

    let destination = null;
    if (intent.type === 'move') {
      const delta = DIRECTION_DELTA[intent.direction];
      if (delta !== undefined) {
        destination = { x: creep.x + delta.dx, y: creep.y + delta.dy };
      }
    } else if (intent.type === 'moveTo') {
      destination = stepToward(world, creep, intent);
    }

    if (destination === null) continue;
    if (blocked(world, destination.x, destination.y, creep)) continue;
    requests.set(creep, destination);
  }

  // Resolved together: two creeps asking for the same tile both stay put,
  // which is close enough to the real engine's contention rule for testing.
  const wanted = new Map();
  for (const [, destination] of requests) {
    const key = `${destination.x},${destination.y}`;
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
  }

  for (const [creep, destination] of requests) {
    if (wanted.get(`${destination.x},${destination.y}`) > 1) continue;

    creep.x = destination.x;
    creep.y = destination.y;

    // Fatigue is charged for the tile entered, not the one left.
    const terrain = world.getTerrainAt(destination.x, destination.y);
    const onRoad = world.at(destination.x, destination.y).some((o) => o.type === 'road');
    const weight = creep.body.filter((part) => part.type !== MOVE && part.hits > 0).length;
    const cost = onRoad ? 0 : TERRAIN_MOVE_COST[terrain] ?? 1;
    creep.fatigue += FATIGUE_PER_WEIGHT * weight * cost;
  }
}

function applyCombat(world, intents) {
  // Damage and healing both read the hits a creep had at the start of the
  // phase, so a creep healed and hit in the same tick nets the difference.
  const deltas = new Map();
  const add = (object, amount) => deltas.set(object, (deltas.get(object) ?? 0) + amount);

  for (const intent of intents) {
    const actor = world.byId(intent.id);
    if (actor === undefined) continue;
    const target = intent.targetId === undefined ? undefined : world.byId(intent.targetId);

    switch (intent.type) {
      case 'attack':
        if (target && range(actor, target) <= 1) {
          add(target, -ATTACK_POWER * livingParts(actor, ATTACK));
        }
        break;

      case 'rangedAttack':
        // Measured: no distance falloff for the single-target attack.
        if (target && range(actor, target) <= 3) {
          add(target, -RANGED_ATTACK_POWER * livingParts(actor, RANGED_ATTACK));
        }
        break;

      case 'rangedMassAttack': {
        const parts = livingParts(actor, RANGED_ATTACK);
        for (const object of world.objects) {
          if (object === actor) continue;
          if (object.type !== 'creep' && object.hitsMax === undefined) continue;
          if (object.my === actor.my) continue;

          const distance = range(actor, object);
          const rate = RANGED_ATTACK_DISTANCE_RATE[distance];
          if (rate !== undefined) add(object, -RANGED_ATTACK_POWER * parts * rate);
        }
        break;
      }

      case 'heal':
        if (target && range(actor, target) <= 1) {
          add(target, HEAL_POWER * livingParts(actor, HEAL));
        }
        break;

      case 'rangedHeal':
        if (target && range(actor, target) <= 3) {
          add(target, RANGED_HEAL_POWER * livingParts(actor, HEAL));
        }
        break;

      case 'towerAttack':
      case 'towerHeal': {
        if (!target) break;
        if ((actor.store?.[RESOURCE_ENERGY] ?? 0) < TOWER_ENERGY_COST) break;
        actor.store[RESOURCE_ENERGY] -= TOWER_ENERGY_COST;
        actor.cooldown = TOWER_COOLDOWN;
        const distance = range(actor, target);
        const power = towerPower(
          intent.type === 'towerAttack' ? TOWER_POWER_ATTACK : TOWER_POWER_HEAL,
          distance,
        );
        add(target, intent.type === 'towerAttack' ? -power : power);
        break;
      }

      default:
        break;
    }
  }

  for (const [object, delta] of deltas) {
    if (delta < 0) {
      damage(object, Math.floor(-delta));
    } else if (delta > 0) {
      object.hits = Math.min(object.hitsMax ?? object.hits, object.hits + Math.floor(delta));
      if (object.type === 'creep') {
        let remaining = object.hits;
        for (const part of object.body) {
          const kept = Math.min(BODYPART_HITS, remaining);
          part.hits = kept;
          remaining -= kept;
        }
      }
    }
  }
}

function applyWork(world, intents) {
  for (const intent of intents) {
    const actor = world.byId(intent.id);
    if (actor === undefined) continue;
    const target = intent.targetId === undefined ? undefined : world.byId(intent.targetId);

    switch (intent.type) {
      case 'harvest': {
        if (!target || target.type !== 'source' || range(actor, target) > 1) break;
        const wanted = HARVEST_POWER * livingParts(actor, WORK);
        const mined = Math.min(wanted, target.energy, freeCapacity(actor));
        if (mined <= 0) break;
        target.energy -= mined;
        actor.store[RESOURCE_ENERGY] = (actor.store[RESOURCE_ENERGY] ?? 0) + mined;
        break;
      }

      case 'build': {
        if (!target || target.type !== 'constructionSite' || range(actor, target) > 3) break;
        const wanted = BUILD_POWER * livingParts(actor, WORK);
        const spent = Math.min(wanted, actor.store?.[RESOURCE_ENERGY] ?? 0);
        if (spent <= 0) break;
        actor.store[RESOURCE_ENERGY] -= spent;
        target.progress += spent;
        break;
      }

      case 'transfer':
        if (target && range(actor, target) <= 1) {
          moveResource(actor, target, intent.resource, intent.amount);
        }
        break;

      case 'withdraw':
        if (target && range(actor, target) <= 1) {
          moveResource(target, actor, intent.resource, intent.amount);
        }
        break;

      case 'drop': {
        const dropped = Math.min(intent.amount, actor.store?.[intent.resource] ?? 0);
        if (dropped <= 0) break;
        actor.store[intent.resource] -= dropped;

        const pile = world
          .at(actor.x, actor.y)
          .find((o) => o.type === 'resource' && o.resourceType === intent.resource);
        if (pile) pile.amount += dropped;
        else world.addResource({ x: actor.x, y: actor.y, amount: dropped, resourceType: intent.resource });
        break;
      }

      case 'pickup': {
        if (!target || target.type !== 'resource' || range(actor, target) > 1) break;
        const taken = Math.min(target.amount, freeCapacity(actor));
        if (taken <= 0) break;
        target.amount -= taken;
        actor.store[target.resourceType] = (actor.store[target.resourceType] ?? 0) + taken;
        if (target.amount <= 0) world.remove(target);
        break;
      }

      case 'removeConstructionSite':
        if (actor.type === 'constructionSite') world.remove(actor);
        break;

      case 'setDirections':
        actor.directions = intent.directions;
        break;

      default:
        break;
    }
  }
}

function applySpawning(world, intents) {
  for (const intent of intents) {
    if (intent.type === 'cancelSpawning') {
      const spawn = world.byId(intent.id);
      if (spawn?.spawning) {
        world.remove(world.byId(spawn.spawning.creepId));
        spawn.spawning = null;
      }
      continue;
    }
    if (intent.type !== 'spawnCreep') continue;

    const spawn = world.byId(intent.id);
    if (spawn === undefined || spawn.spawning !== null) continue;

    // Energy comes from the spawn and its owner's extensions, as in the game.
    const pool = [spawn, ...world.ofType('extension').filter((e) => e.my === spawn.my)];
    const available = pool.reduce((sum, o) => sum + (o.store?.[RESOURCE_ENERGY] ?? 0), 0);
    const cost = intent.body.reduce((sum, part) => sum + (BODYPART_COST[part] ?? 0), 0);
    if (available < cost) continue;

    let owed = cost;
    for (const source of pool) {
      const spent = Math.min(owed, source.store?.[RESOURCE_ENERGY] ?? 0);
      source.store[RESOURCE_ENERGY] -= spent;
      owed -= spent;
      if (owed === 0) break;
    }

    const creep = world.addCreep({
      my: spawn.my,
      x: spawn.x,
      y: spawn.y,
      body: intent.body,
      spawning: true,
    });
    const needTime = intent.body.length * CREEP_SPAWN_TIME;
    spawn.spawning = {
      spawnId: spawn.id,
      creepId: creep.id,
      needTime,
      remainingTime: needTime,
    };
  }
}

function upkeep(world) {
  for (const object of world.objects) {
    if (object.type === 'creep') {
      const recovery = FATIGUE_RECOVERY_PER_MOVE * livingParts(object, MOVE);
      object.fatigue = Math.max(0, object.fatigue - recovery);
    } else if (object.type === 'tower') {
      object.cooldown = Math.max(0, object.cooldown - 1);
    } else if (object.type === 'spawn') {
      const held = object.store[RESOURCE_ENERGY] ?? 0;
      object.store[RESOURCE_ENERGY] = Math.min(SPAWN_ENERGY_CAPACITY, held + SPAWN_ENERGY_REGEN);
    } else if (object.type === 'source') {
      object.energy = Math.min(object.energyCapacity, object.energy + SOURCE_ENERGY_REGEN);
    }
  }
}

function cleanup(world) {
  for (const spawn of world.ofType('spawn')) {
    if (spawn.spawning === null) continue;

    spawn.spawning.remainingTime -= 1;
    if (spawn.spawning.remainingTime > 0) continue;

    const creep = world.byId(spawn.spawning.creepId);
    if (creep) creep.spawning = false;
    spawn.spawning = null;
  }

  for (const site of world.ofType('constructionSite')) {
    if (site.progress < site.progressTotal) continue;
    world.remove(site);
    // The finished structure is not created: which prototype to build is arena
    // specific, and guessing would be worse than leaving the gap visible.
  }

  for (const object of [...world.objects]) {
    if (object.hits !== undefined && object.hits <= 0) {
      object.exists = false;
      world.remove(object);
    }
  }
}

/** Runs the upkeep that happens before the bot sees the world. */
export function beginTick(world) {
  world.intents = [];
  world.visuals = [];
  upkeep(world);
}

/** Applies everything the bot asked for, then advances the clock. */
export function endTick(world) {
  const intents = world.intents;

  applyMoves(world, intents);
  applyCombat(world, intents);
  applyWork(world, intents);
  applySpawning(world, intents);
  cleanup(world);

  world.tick += 1;
}
