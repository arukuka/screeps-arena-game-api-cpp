/**
 * Simulated `game/utils`.
 *
 * Signatures match the real module exactly -- `js/host.mjs` consumes this and
 * the production module through the same code path.
 */

import { world } from './_current.mjs';
import { wrap, WRAPPER_BY_TYPE } from './prototypes.mjs';
import { CONSTRUCTION_COST, ERR_INVALID_TARGET, TERRAIN_WALL } from './constants.mjs';
import { searchPath } from './path-finder.mjs';

const range = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const count = (name) => {
  world().countApiCall(name);
};

/** The number of ticks passed from the start of the current game. */
export function getTicks() {
  count('getTicks');
  return world().tick;
}

/** CPU wall time elapsed in the current tick, in nanoseconds. */
export function getCpuTime() {
  count('getCpuTime');
  // Real elapsed time, so a bot that budgets against it behaves plausibly.
  return Number(process.hrtime.bigint() % 1_000_000_000n);
}

export function getDirection(dx, dy) {
  count('getDirection');
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx === 0 && ady === 0) return 0;
  if (adx > ady * 2) return dx > 0 ? 3 : 7;
  if (ady > adx * 2) return dy > 0 ? 5 : 1;
  if (dx > 0) return dy > 0 ? 4 : 2;
  return dy > 0 ? 6 : 8;
}

export function getTerrainAt(pos) {
  count('getTerrainAt');
  return world().getTerrainAt(pos.x, pos.y);
}

export function getObjects() {
  count('getObjects');
  return world().objects.map(wrap);
}

export function getObjectById(id) {
  count('getObjectById');
  const raw = world().byId(id);
  return raw === undefined ? undefined : wrap(raw);
}

export function getObjectsByPrototype(prototype) {
  count('getObjectsByPrototype');
  return world()
    .objects.filter((raw) => {
      const Wrapper = WRAPPER_BY_TYPE[raw.type];
      return Wrapper !== undefined && Wrapper.prototype instanceof prototype
        ? true
        : Wrapper === prototype;
    })
    .map(wrap);
}

export function getRange(a, b) {
  count('getRange');
  return range(a, b);
}

export function findClosestByRange(from, targets) {
  count('findClosestByRange');
  let best = null;
  let bestRange = Infinity;
  for (const target of targets ?? []) {
    const distance = range(from, target);
    if (distance < bestRange) {
      best = target;
      bestRange = distance;
    }
  }
  return best;
}

export function findInRange(from, targets, distance) {
  count('findInRange');
  return (targets ?? []).filter((target) => range(from, target) <= distance);
}

export function findPath(from, to, options = {}) {
  count('findPath');
  return searchPath(from, { pos: to, range: 0 }, options).path;
}

export function findClosestByPath(from, targets, options = {}) {
  count('findClosestByPath');
  let best = null;
  let bestCost = Infinity;
  for (const target of targets ?? []) {
    const result = searchPath(from, { pos: target, range: 0 }, options);
    if (result.incomplete) continue;
    if (result.cost < bestCost) {
      best = target;
      bestCost = result.cost;
    }
  }
  return best;
}

export function createConstructionSite(pos, prototype) {
  count('createConstructionSite');
  const name = prototype?.name;
  if (name === undefined) return { error: ERR_INVALID_TARGET };
  if (world().getTerrainAt(pos.x, pos.y) === TERRAIN_WALL) {
    return { error: ERR_INVALID_TARGET };
  }

  const site = world().addConstructionSite({
    x: pos.x,
    y: pos.y,
    structureType: name,
    progressTotal: CONSTRUCTION_COST[name] ?? 1,
  });
  return { object: wrap(site) };
}
