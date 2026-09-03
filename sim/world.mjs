/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * The simulated match state.
 *
 * Plain data. `sim/game/*` reads it and hands the bot object wrappers;
 * `sim/engine.mjs` resolves the intents those wrappers record and advances a
 * tick. Tests build a world directly:
 *
 *   const world = new World({ width: 20, height: 20 });
 *   world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: ['move', 'work'] });
 *   world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });
 */

import {
  CARRY,
  CARRY_CAPACITY,
  CONTAINER_CAPACITY,
  CONTAINER_HITS,
  EXTENSION_ENERGY_CAPACITY,
  EXTENSION_HITS,
  RAMPART_HITS_MAX,
  RESOURCE_ENERGY,
  ROAD_HITS,
  SPAWN_ENERGY_CAPACITY,
  SPAWN_HITS,
  TERRAIN_PLAIN,
  TERRAIN_WALL,
  TOWER_CAPACITY,
  TOWER_HITS,
  WALL_HITS_MAX,
  BODYPART_HITS,
} from './game/constants.mjs';

/** Mirrors the real `arenaInfo` object well enough to drive a local match. */
export const DEFAULT_ARENA_INFO = Object.freeze({
  name: 'Local Simulator',
  season: 'local',
  level: 1,
  ticksLimit: 2000,
  // Nanoseconds, matching getCpuTime(). These were milliseconds until the
  // benchmark was run on Pain and Gain and printed a nonsense figure: the real
  // arenaInfo reports 1e8 and 1e9, which are 100 ms and 1 s as nanoseconds and
  // absurd as anything else. The typings state no unit.
  cpuTimeLimit: 100_000_000,
  cpuTimeLimitFirstTick: 1_000_000_000,
});

let autoId = 0;
const nextId = (prefix) => `${prefix}${(autoId += 1)}`;

export class World {
  /**
   * @param {object} [options]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {object} [options.arenaInfo]  overrides for `DEFAULT_ARENA_INFO`
   */
  constructor({ width = 50, height = 50, arenaInfo = {} } = {}) {
    this.arenaInfo = Object.freeze({ ...DEFAULT_ARENA_INFO, ...arenaInfo });
    this.width = width;
    this.height = height;

    /** The Arena numbers ticks from 1; the bot never observes tick 0. */
    this.tick = 1;

    /**
     * When the current tick began, for `getCpuTime()`. Set by `beginTick()`;
     * initialised here so a test that binds a world without running the engine
     * still gets a sane reading rather than a negative one.
     *
     * `performance.now()` rather than `process.hrtime.bigint()`: a bot timing
     * itself calls this often, and BigInt arithmetic made the reading cost more
     * than most of what it was being used to measure.
     */
    this.tickStartedAt = performance.now();

    /** Row-major terrain grid, TERRAIN_* per tile. */
    this.terrain = new Uint8Array(width * height);

    /** Every live object, in insertion order. */
    this.objects = [];

    /**
     * Intents the bot issued this tick, in order, before the engine applied
     * them. Cleared at the start of each tick. Tests assert on this to check
     * what the bot decided, independently of how the engine resolved it.
     */
    this.intents = [];

    /** Drawing calls made through `game/visual`. */
    this.visuals = [];

    /**
     * How often the bot reached for each API. The Arena bills wall-clock CPU
     * per tick, and a WASM bot pays that cost at the JS boundary, so counting
     * boundary crossings is the cheapest profiling this simulator can offer.
     */
    this.apiCalls = {};
  }

  countApiCall(name) {
    this.apiCalls[name] = (this.apiCalls[name] ?? 0) + 1;
  }

  // --- terrain --------------------------------------------------------------

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getTerrainAt(x, y) {
    if (!this.inBounds(x, y)) return TERRAIN_WALL;
    return this.terrain[y * this.width + x];
  }

  setTerrainAt(x, y, value) {
    if (this.inBounds(x, y)) this.terrain[y * this.width + x] = value;
    return this;
  }

  /** Fills a rectangle, inclusive of both corners. */
  fillTerrain(x1, y1, x2, y2, value) {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) this.setTerrainAt(x, y, value);
    }
    return this;
  }

  // --- queries --------------------------------------------------------------

  byId(id) {
    return this.objects.find((object) => object.id === id);
  }

  at(x, y) {
    return this.objects.filter((object) => object.x === x && object.y === y);
  }

  ofType(type) {
    return this.objects.filter((object) => object.type === type);
  }

  /** The first creep with this id, for readable assertions. */
  creep(id) {
    return this.byId(id);
  }

  remove(object) {
    const index = this.objects.indexOf(object);
    if (index >= 0) this.objects.splice(index, 1);
  }

  // --- construction ---------------------------------------------------------

  #add(object) {
    this.objects.push(object);
    return object;
  }

  /**
   * @param {object} spec
   * @param {string[]} spec.body  body part names, in order
   */
  addCreep({
    id = nextId('creep'),
    my = true,
    x = 0,
    y = 0,
    body = [],
    hits,
    fatigue = 0,
    spawning = false,
    store = {},
    effects = [],
  }) {
    const parts = body.map((type) => ({ type, hits: BODYPART_HITS }));
    const hitsMax = parts.length * BODYPART_HITS;
    const carryParts = parts.filter((part) => part.type === CARRY).length;

    return this.#add({
      type: 'creep',
      id,
      my,
      x,
      y,
      body: parts,
      hits: hits ?? hitsMax,
      hitsMax,
      fatigue,
      spawning,
      store: { ...store },
      storeCapacity: carryParts * CARRY_CAPACITY,
      effects,
      exists: true,
    });
  }

  addSource({ id = nextId('source'), x = 0, y = 0, energy = 3000, energyCapacity }) {
    return this.#add({
      type: 'source',
      id,
      x,
      y,
      energy,
      energyCapacity: energyCapacity ?? energy,
      exists: true,
      effects: [],
    });
  }

  addResource({
    id = nextId('resource'),
    x = 0,
    y = 0,
    amount = 100,
    resourceType = RESOURCE_ENERGY,
  }) {
    return this.#add({
      type: 'resource',
      id,
      x,
      y,
      amount,
      resourceType,
      exists: true,
      effects: [],
    });
  }

  addFlag({ id = nextId('flag'), x = 0, y = 0, my = undefined }) {
    return this.#add({ type: 'flag', id, x, y, my, exists: true, effects: [] });
  }

  addConstructionSite({
    id = nextId('site'),
    x = 0,
    y = 0,
    my = true,
    structureType = 'StructureRampart',
    progress = 0,
    progressTotal = 1,
  }) {
    return this.#add({
      type: 'constructionSite',
      id,
      x,
      y,
      my,
      structureType,
      progress,
      progressTotal,
      exists: true,
      effects: [],
    });
  }

  addSpawn({ id = nextId('spawn'), x = 0, y = 0, my = true, hits, store = {} }) {
    return this.#add({
      type: 'spawn',
      id,
      x,
      y,
      my,
      hits: hits ?? SPAWN_HITS,
      hitsMax: SPAWN_HITS,
      store: { [RESOURCE_ENERGY]: SPAWN_ENERGY_CAPACITY, ...store },
      storeCapacity: SPAWN_ENERGY_CAPACITY,
      spawning: null,
      directions: [],
      exists: true,
      effects: [],
    });
  }

  addTower({ id = nextId('tower'), x = 0, y = 0, my = true, hits, store = {}, cooldown = 0 }) {
    return this.#add({
      type: 'tower',
      id,
      x,
      y,
      my,
      hits: hits ?? TOWER_HITS,
      hitsMax: TOWER_HITS,
      store: { [RESOURCE_ENERGY]: TOWER_CAPACITY, ...store },
      storeCapacity: TOWER_CAPACITY,
      cooldown,
      exists: true,
      effects: [],
    });
  }

  addContainer({ id = nextId('container'), x = 0, y = 0, my = undefined, hits, store = {} }) {
    return this.#add({
      type: 'container',
      id,
      x,
      y,
      my,
      hits: hits ?? CONTAINER_HITS,
      hitsMax: CONTAINER_HITS,
      store: { ...store },
      storeCapacity: CONTAINER_CAPACITY,
      exists: true,
      effects: [],
    });
  }

  addExtension({ id = nextId('extension'), x = 0, y = 0, my = true, hits, store = {} }) {
    return this.#add({
      type: 'extension',
      id,
      x,
      y,
      my,
      hits: hits ?? EXTENSION_HITS,
      hitsMax: EXTENSION_HITS,
      store: { [RESOURCE_ENERGY]: 0, ...store },
      storeCapacity: EXTENSION_ENERGY_CAPACITY,
      exists: true,
      effects: [],
    });
  }

  addWall({ id = nextId('wall'), x = 0, y = 0, hits }) {
    return this.#add({
      type: 'constructedWall',
      id,
      x,
      y,
      hits: hits ?? WALL_HITS_MAX,
      hitsMax: WALL_HITS_MAX,
      exists: true,
      effects: [],
    });
  }

  addRampart({ id = nextId('rampart'), x = 0, y = 0, my = true, hits }) {
    return this.#add({
      type: 'rampart',
      id,
      x,
      y,
      my,
      hits: hits ?? RAMPART_HITS_MAX,
      hitsMax: RAMPART_HITS_MAX,
      exists: true,
      effects: [],
    });
  }

  addRoad({ id = nextId('road'), x = 0, y = 0, hits }) {
    return this.#add({
      type: 'road',
      id,
      x,
      y,
      hits: hits ?? ROAD_HITS,
      hitsMax: ROAD_HITS,
      exists: true,
      effects: [],
    });
  }

  get finished() {
    return this.tick > this.arenaInfo.ticksLimit;
  }
}

/** Terrain is plain unless a test says otherwise. */
export { TERRAIN_PLAIN };
