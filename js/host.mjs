/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * The host table: the one place that maps the Screeps: Arena JS API onto the
 * names the WASM module calls (see `src/bridge.cc`).
 *
 * Both entry points go through here -- `js/arena.mjs` passes the real `game/*`
 * modules, `sim/harness.mjs` passes the simulated ones -- so the simulator
 * cannot drift from production by wiring something up differently.
 */

/**
 * The snapshot record layout.
 *
 * **Must match `arena::detail::Field` in `include/arena/object.h`, in order.**
 * `tests/snapshot.test.mjs` parses the header and fails if the two drift, which
 * they otherwise would silently -- a reordered field means every read returns
 * a different property's value.
 */
export const SNAPSHOT_FIELDS = [
  'x', 'y', 'exists', 'ticksToDecay',
  'hits', 'hitsMax', 'my', 'fatigue', 'spawning',
  'energy', 'energyCapacity', 'amount', 'progress', 'progressTotal', 'cooldown',
  'storeEnergy', 'storeCapacity', 'storeUsed',
];

export const SNAPSHOT_FIELD_COUNT = SNAPSHOT_FIELDS.length;

/** Written where the object has no such property. INT32_MIN, matching C++. */
const ABSENT = -2147483648;

/** Numbers pass through; anything else, including null, reads as absent. */
const numeric = (value) => (typeof value === 'number' ? value | 0 : ABSENT);

/**
 * Booleans only. A `spawning` that is a Spawning object rather than a flag --
 * which is what a spawn has -- reads as absent, so C++ falls back to the
 * handle and gets the object it expects.
 */
const flag = (value) => (typeof value === 'boolean' ? (value ? 1 : 0) : ABSENT);

/**
 * How to read each slot. `store` is passed in so it is fetched at most once.
 *
 * One shared loop drives all of these, rather than a specialised loop per
 * field. That reads like the slower option and is not: measured three times on
 * the real game, per-field loops came out 1.43x worse and a single loop reading
 * a whole record 2.9x worse. What dominates is simply how many properties get
 * read off Arena game objects, which is why columns load lazily at all.
 * See bench/README.md.
 */
const READERS = {
  x: (o) => numeric(o.x),
  y: (o) => numeric(o.y),
  exists: (o) => flag(o.exists),
  ticksToDecay: (o) => numeric(o.ticksToDecay),
  hits: (o) => numeric(o.hits),
  hitsMax: (o) => numeric(o.hitsMax),
  my: (o) => flag(o.my),
  fatigue: (o) => numeric(o.fatigue),
  spawning: (o) => flag(o.spawning),
  energy: (o) => numeric(o.energy),
  energyCapacity: (o) => numeric(o.energyCapacity),
  amount: (o) => numeric(o.amount),
  progress: (o) => numeric(o.progress),
  progressTotal: (o) => numeric(o.progressTotal),
  cooldown: (o) => numeric(o.cooldown),
  storeEnergy: (_o, store) => (store ? numeric(store.energy) : ABSENT),
  storeCapacity: (_o, store) => (store ? numeric(store.getCapacity('energy')) : ABSENT),
  storeUsed: (_o, store) => (store ? numeric(store.getUsedCapacity('energy')) : ABSENT),
};

/**
 * `getObjectsByPrototype()` takes a constructor in JS but a name across the
 * WASM boundary, because a C++ template parameter is not a JS value. This is
 * where the name becomes the prototype again.
 *
 * The keys must match the `kPrototype` strings in <arena/prototypes.h>.
 */
function prototypeTable(prototypes) {
  const {
    ConstructionSite, Creep, Flag, GameObject, OwnedStructure, Resource,
    Source, Structure, StructureContainer, StructureExtension, StructureRampart,
    StructureRoad, StructureSpawn, StructureTower, StructureWall,
  } = prototypes;

  return {
    ConstructionSite, Creep, Flag, GameObject, OwnedStructure, Resource,
    Source, Structure, StructureContainer, StructureExtension, StructureRampart,
    StructureRoad, StructureSpawn, StructureTower, StructureWall,
  };
}

/**
 * @param {object} deps
 * @param {object} deps.utils       the `game/utils` module
 * @param {object} deps.prototypes  the `game/prototypes` module
 * @param {object} deps.constants   the `game/constants` module
 * @param {object} [deps.pathFinder] the `game/path-finder` module
 * @param {object} [deps.visual]     the `game/visual` module
 * @param {object} [deps.arenaInfo]  the `arenaInfo` object
 * @param {(text: string) => void} [deps.log]  where `printf` output goes
 * @returns {object} the table exposed to C++ as `Module.arena`
 */
export function createHost({
  utils,
  prototypes,
  constants,
  pathFinder,
  visual,
  arenaInfo,
  log = (text) => console.log(text),
}) {
  const byName = prototypeTable(prototypes);

  return {
    // --- scalars, passed by reference: every call crosses the WASM boundary
    // once per use, and the Arena bills wall-clock CPU.
    getTicks: utils.getTicks,
    getCpuTime: utils.getCpuTime,
    getDirection: utils.getDirection,
    getTerrainAt: utils.getTerrainAt,

    // --- objects
    getObjects: utils.getObjects,
    getObjectById: utils.getObjectById,
    getObjectsByPrototype: (name) => {
      const prototype = byName[name];
      if (prototype === undefined) {
        throw new Error(`unknown prototype "${name}"; add it to js/host.mjs`);
      }
      return utils.getObjectsByPrototype(prototype);
    },

    // --- search
    findClosestByPath: utils.findClosestByPath,
    findClosestByRange: utils.findClosestByRange,
    findInRange: utils.findInRange,
    findPath: utils.findPath,
    searchPath: pathFinder?.searchPath,

    createConstructionSite: (pos, name) => {
      const prototype = byName[name];
      if (prototype === undefined) {
        throw new Error(`unknown prototype "${name}"; add it to js/host.mjs`);
      }
      return utils.createConstructionSite(pos, prototype);
    },

    // --- constructors C++ calls with `new`
    CostMatrix: pathFinder?.CostMatrix,
    Visual: visual?.Visual,

    /**
     * The objects of one prototype. No data is copied; `snapshotField` below
     * fetches what the bot actually reads.
     *
     * @param {string} name  prototype name, matching `kPrototype` in C++
     * @returns {object[]} the matching game objects
     */
    objectsByPrototype: (name) => {
      const prototype = byName[name];
      if (prototype === undefined) {
        throw new Error(`unknown prototype "${name}"; add it to js/host.mjs`);
      }
      return utils.getObjectsByPrototype(prototype);
    },

    /**
     * Fills one field, for every object in a slice, in one crossing.
     *
     * A *column* rather than a record, on purpose. Reading a property off an
     * Arena game object costs ~150 ns even from JavaScript, so filling fields
     * the bot never asks for is money spent for nothing: eagerly writing all 18
     * slots for 28 creeps measured 104 us a tick on the real game, which was
     * worse than not snapshotting at all. Loading a column on first use means a
     * bot pays for the fields it reads, once, however many times it reads them.
     *
     * The view is valid only for the duration of this call, and only because
     * the module is built with ALLOW_MEMORY_GROWTH=0. A heap that grows
     * detaches this buffer and the writes vanish without erroring. See
     * cmake/ArenaBot.cmake.
     *
     * @param {object[]} objects  the slice, from objectsByPrototype
     * @param {string} field      which field, from SNAPSHOT_FIELDS
     * @param {Int32Array} view   WASM memory covering this slice's records
     * @param {number} slot       the field's index within a record
     * @param {number} stride     fields per record
     */
    snapshotField: (objects, field, view, slot, stride) => {
      const read = READERS[field];
      if (read === undefined) {
        throw new Error(`unknown snapshot field "${field}"; see SNAPSHOT_FIELDS`);
      }

      const wantsStore = field.startsWith('store');
      for (let index = 0; index < objects.length; index += 1) {
        const object = objects[index];
        view[index * stride + slot] = read(object, wantsStore ? object.store : undefined);
      }
    },


    // --- the constants that <arena/constants.h> refuses to guess at, exposed
    // so C++ can read the real values instead.
    OBSTACLE_OBJECT_TYPES: constants?.OBSTACLE_OBJECT_TYPES,
    RESOURCES_ALL: constants?.RESOURCES_ALL,
    CONSTRUCTION_COST: constants?.CONSTRUCTION_COST,

    arenaInfo,
    log,
  };
}
