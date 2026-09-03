/**
 * Simulated `game/prototypes`.
 *
 * These are the objects the bot actually holds. An action method validates
 * against the current state, records an intent, and returns the game's result
 * code immediately -- the engine applies the intent later, at the end of the
 * tick, so ordering between creeps does not depend on who ran first.
 *
 * Validation is an approximation of the real engine's. Where it is known to
 * differ, `sim/FIDELITY.md` says so.
 */

import {
  ATTACK,
  CARRY,
  ERR_BUSY,
  ERR_FULL,
  ERR_INVALID_ARGS,
  ERR_INVALID_TARGET,
  ERR_NOT_ENOUGH_ENERGY,
  ERR_NOT_ENOUGH_RESOURCES,
  ERR_NOT_IN_RANGE,
  ERR_NOT_OWNER,
  ERR_NO_BODYPART,
  ERR_TIRED,
  HEAL,
  MOVE,
  OK,
  RANGED_ATTACK,
  RESOURCE_ENERGY,
  RESOURCES_ALL,
  TOWER_RANGE,
  WORK,
  DIRECTION_DELTA,
} from './constants.mjs';
import { world } from './_current.mjs';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Live parts of a type. A part with no hits left does nothing. */
const countParts = (object, type) =>
  (object.body ?? []).filter((part) => part.type === type && part.hits > 0).length;

const storeTotal = (object) =>
  Object.values(object.store ?? {}).reduce((sum, amount) => sum + amount, 0);

/** A `Store`, with both the resource amounts and the three methods. */
function makeStore(object) {
  const capacity = object.storeCapacity ?? 0;
  const store = {
    getCapacity: () => capacity,
    getUsedCapacity: (resource) =>
      resource === undefined ? storeTotal(object) : object.store?.[resource] ?? 0,
    getFreeCapacity: () => capacity - storeTotal(object),
  };
  // The real Store reports 0 for a resource it does not hold, not undefined.
  for (const resource of RESOURCES_ALL) store[resource] = 0;
  for (const [resource, amount] of Object.entries(object.store ?? {})) {
    store[resource] = amount;
  }
  return store;
}

function record(intent) {
  world().intents.push(intent);
  return OK;
}

/** Base prototype. Every wrapper reads through to the raw world object. */
export class GameObject {
  constructor(raw) {
    this.raw = raw;
  }

  get exists() { return this.raw.exists; }
  get id() { return this.raw.id; }
  get x() { return this.raw.x; }
  get y() { return this.raw.y; }
  get ticksToDecay() { return this.raw.ticksToDecay; }
  get effects() { return this.raw.effects ?? []; }

  getRangeTo(pos) { return range(this, pos); }
}

export class Structure extends GameObject {
  get hits() { return this.raw.hits; }
  get hitsMax() { return this.raw.hitsMax; }
}

export class OwnedStructure extends Structure {
  get my() { return this.raw.my; }
}

export class Source extends GameObject {
  get energy() { return this.raw.energy; }
  get energyCapacity() { return this.raw.energyCapacity; }
}

export class Resource extends GameObject {
  get amount() { return this.raw.amount; }
  get resourceType() { return this.raw.resourceType; }
}

export class Flag extends GameObject {
  get my() { return this.raw.my; }
}

export class ConstructionSite extends GameObject {
  get my() { return this.raw.my; }
  get progress() { return this.raw.progress; }
  get progressTotal() { return this.raw.progressTotal; }
  get structure() { return undefined; }

  remove() {
    record({ type: 'removeConstructionSite', id: this.id });
  }
}

export class Creep extends GameObject {
  get body() { return this.raw.body; }
  get fatigue() { return this.raw.fatigue; }
  get hits() { return this.raw.hits; }
  get hitsMax() { return this.raw.hitsMax; }
  get my() { return this.raw.my; }
  get spawning() { return this.raw.spawning; }
  get store() { return makeStore(this.raw); }

  #act({ part, target, maxRange = 1, type, extra = {} }) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (part !== undefined && countParts(this.raw, part) === 0) return ERR_NO_BODYPART;
    if (target !== undefined) {
      if (target?.raw === undefined || !target.raw.exists) return ERR_INVALID_TARGET;
      if (range(this, target) > maxRange) return ERR_NOT_IN_RANGE;
    }
    return record({ type, id: this.id, targetId: target?.id, ...extra });
  }

  attack(target) { return this.#act({ part: ATTACK, target, type: 'attack' }); }
  build(target) { return this.#act({ part: WORK, target, maxRange: 3, type: 'build' }); }
  harvest(target) { return this.#act({ part: WORK, target, type: 'harvest' }); }
  heal(target) { return this.#act({ part: HEAL, target, type: 'heal' }); }
  pickup(target) { return this.#act({ part: CARRY, target, type: 'pickup' }); }
  pull(target) { return this.#act({ part: MOVE, target, type: 'pull' }); }
  rangedAttack(target) {
    return this.#act({ part: RANGED_ATTACK, target, maxRange: 3, type: 'rangedAttack' });
  }
  rangedHeal(target) {
    return this.#act({ part: HEAL, target, maxRange: 3, type: 'rangedHeal' });
  }
  rangedMassAttack() {
    return this.#act({ part: RANGED_ATTACK, type: 'rangedMassAttack' });
  }

  move(direction) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (countParts(this.raw, MOVE) === 0) return ERR_NO_BODYPART;
    if (DIRECTION_DELTA[direction] === undefined) return ERR_INVALID_ARGS;
    if (this.raw.fatigue > 0) return ERR_TIRED;
    return record({ type: 'move', id: this.id, direction });
  }

  moveTo(target) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (countParts(this.raw, MOVE) === 0) return ERR_NO_BODYPART;
    if (this.raw.fatigue > 0) return ERR_TIRED;
    return record({ type: 'moveTo', id: this.id, x: target.x, y: target.y });
  }

  drop(resource = RESOURCE_ENERGY, amount) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    const held = this.raw.store?.[resource] ?? 0;
    if (held === 0) return ERR_NOT_ENOUGH_RESOURCES;
    if (amount !== undefined && (amount <= 0 || amount > held)) return ERR_INVALID_ARGS;
    return record({ type: 'drop', id: this.id, resource, amount: amount ?? held });
  }

  transfer(target, resource = RESOURCE_ENERGY, amount) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (target?.raw === undefined || !target.raw.exists) return ERR_INVALID_TARGET;
    if (range(this, target) > 1) return ERR_NOT_IN_RANGE;

    const held = this.raw.store?.[resource] ?? 0;
    if (held === 0) return ERR_NOT_ENOUGH_RESOURCES;
    if (amount !== undefined && (amount <= 0 || amount > held)) return ERR_INVALID_ARGS;

    const free = (target.raw.storeCapacity ?? 0) - storeTotal(target.raw);
    if (free <= 0) return ERR_FULL;

    return record({
      type: 'transfer',
      id: this.id,
      targetId: target.id,
      resource,
      amount: Math.min(amount ?? held, free),
    });
  }

  withdraw(target, resource = RESOURCE_ENERGY, amount) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (target?.raw === undefined || !target.raw.exists) return ERR_INVALID_TARGET;
    if (range(this, target) > 1) return ERR_NOT_IN_RANGE;

    const available = target.raw.store?.[resource] ?? 0;
    if (available === 0) return ERR_NOT_ENOUGH_RESOURCES;
    if (amount !== undefined && (amount <= 0 || amount > available)) return ERR_INVALID_ARGS;

    const free = (this.raw.storeCapacity ?? 0) - storeTotal(this.raw);
    if (free <= 0) return ERR_FULL;

    return record({
      type: 'withdraw',
      id: this.id,
      targetId: target.id,
      resource,
      amount: Math.min(amount ?? available, free),
    });
  }
}

export class Spawning {
  constructor(raw) {
    this.raw = raw;
  }

  get needTime() { return this.raw.needTime; }
  get remainingTime() { return this.raw.remainingTime; }
  get creep() { return new Creep(world().byId(this.raw.creepId)); }

  cancel() {
    record({ type: 'cancelSpawning', id: this.raw.spawnId });
    return OK;
  }
}

export class StructureSpawn extends OwnedStructure {
  get store() { return makeStore(this.raw); }
  get directions() { return this.raw.directions ?? []; }

  get spawning() {
    return this.raw.spawning === null ? null : new Spawning(this.raw.spawning);
  }

  setDirections(directions) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (!Array.isArray(directions)) return ERR_INVALID_ARGS;
    return record({ type: 'setDirections', id: this.id, directions });
  }

  spawnCreep(body) {
    if (!this.raw.my) return { error: ERR_NOT_OWNER };
    if (!Array.isArray(body) || body.length === 0) return { error: ERR_INVALID_ARGS };
    if (this.raw.spawning !== null) return { error: ERR_BUSY };

    record({ type: 'spawnCreep', id: this.id, body });

    // The real API returns the creep object here, before it exists on the map.
    // The engine creates it when it applies the intent, so there is nothing to
    // hand back yet; `sim/FIDELITY.md` records the difference.
    return {};
  }
}

export class StructureTower extends OwnedStructure {
  get store() { return makeStore(this.raw); }
  get cooldown() { return this.raw.cooldown; }

  #act(target, type) {
    if (!this.raw.my) return ERR_NOT_OWNER;
    if (this.raw.cooldown > 0) return ERR_TIRED;
    if ((this.raw.store?.[RESOURCE_ENERGY] ?? 0) < 1) return ERR_NOT_ENOUGH_ENERGY;
    if (target?.raw === undefined || !target.raw.exists) return ERR_INVALID_TARGET;
    if (range(this, target) > TOWER_RANGE) return ERR_INVALID_TARGET;
    return record({ type, id: this.id, targetId: target.id });
  }

  attack(target) { return this.#act(target, 'towerAttack'); }
  heal(target) { return this.#act(target, 'towerHeal'); }
}

export class StructureContainer extends OwnedStructure {
  get store() { return makeStore(this.raw); }
}

export class StructureExtension extends OwnedStructure {
  get store() { return makeStore(this.raw); }
}

export class StructureWall extends Structure {}
export class StructureRampart extends OwnedStructure {}
export class StructureRoad extends Structure {}

/** World object `type` -> the wrapper the bot receives. */
export const WRAPPER_BY_TYPE = {
  creep: Creep,
  source: Source,
  resource: Resource,
  flag: Flag,
  constructionSite: ConstructionSite,
  spawn: StructureSpawn,
  tower: StructureTower,
  container: StructureContainer,
  extension: StructureExtension,
  constructedWall: StructureWall,
  rampart: StructureRampart,
  road: StructureRoad,
};

export function wrap(raw) {
  const Wrapper = WRAPPER_BY_TYPE[raw.type] ?? GameObject;
  return new Wrapper(raw);
}
