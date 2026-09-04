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

function writeRecord(object, view, at) {
  view[at] = numeric(object.x);
  view[at + 1] = numeric(object.y);
  view[at + 2] = flag(object.exists);
  view[at + 3] = numeric(object.ticksToDecay);
  view[at + 4] = numeric(object.hits);
  view[at + 5] = numeric(object.hitsMax);
  view[at + 6] = flag(object.my);
  view[at + 7] = numeric(object.fatigue);
  view[at + 8] = flag(object.spawning);
  view[at + 9] = numeric(object.energy);
  view[at + 10] = numeric(object.energyCapacity);
  view[at + 11] = numeric(object.amount);
  view[at + 12] = numeric(object.progress);
  view[at + 13] = numeric(object.progressTotal);
  view[at + 14] = numeric(object.cooldown);

  // One property access decides whether the three store slots are worth
  // fetching at all; most objects have no store.
  const store = object.store;
  if (store === undefined || store === null) {
    view[at + 15] = ABSENT;
    view[at + 16] = ABSENT;
    view[at + 17] = ABSENT;
    return;
  }
  view[at + 15] = numeric(store.energy);
  view[at + 16] = numeric(store.getCapacity('energy'));
  view[at + 17] = numeric(store.getUsedCapacity('energy'));
}

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
     * Copies one prototype's objects into WASM memory and returns the objects.
     *
     * This is the read half of the hybrid backend. One crossing buys both the
     * data -- every numeric field of every matching object -- and the handles
     * that actions still need. Reading the same fields one at a time through
     * handles costs ~500 ns each on the real game; from WASM memory afterwards
     * they cost ~0.24 ns.
     *
     * The view is valid only for the duration of this call, and only because
     * the module is built with ALLOW_MEMORY_GROWTH=0. A heap that grows
     * detaches this buffer and the writes vanish without erroring. See
     * cmake/ArenaBot.cmake.
     *
     * @param {string} name      prototype name, matching `kPrototype` in C++
     * @param {Int32Array} view  WASM memory to fill, starting at record 0
     * @returns {object[]} the matching game objects, in the order written
     */
    snapshotByPrototype: (name, view) => {
      const prototype = byName[name];
      if (prototype === undefined) {
        throw new Error(`unknown prototype "${name}"; add it to js/host.mjs`);
      }

      const objects = utils.getObjectsByPrototype(prototype);
      if (objects.length * SNAPSHOT_FIELD_COUNT <= view.length) {
        for (let index = 0; index < objects.length; index += 1) {
          writeRecord(objects[index], view, index * SNAPSHOT_FIELD_COUNT);
        }
      }
      // If it does not fit, write nothing: C++ sees the size and falls back to
      // reading through handles, which is slow but never wrong.
      return objects;
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
