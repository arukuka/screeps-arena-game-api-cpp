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
     * Bulk-copies every creep into WASM memory in a single crossing.
     *
     * EXPERIMENTAL. This is the prototype of a snapshot backend, kept here so
     * `bench/` can measure it against the handle-based reads the object model
     * currently uses.
     *
     * The point is that the cost does not scale with the number of fields:
     * C++ hands over a typed view of its own memory and JavaScript fills it,
     * so 5 fields per creep cost one crossing rather than five per creep.
     * Reading the same data through handles costs ~1.8us *per field* on the
     * real game.
     *
     * The view is only valid for the duration of this call, and only because
     * the module is built with ALLOW_MEMORY_GROWTH=0. If growth is ever turned
     * on, a heap that grows detaches this buffer and these writes go nowhere
     * without erroring. See cmake/ArenaBot.cmake.
     *
     * @param {Int32Array} view  a view onto WASM memory, sized by the caller
     * @returns {number} how many creeps were written; fields per creep is 5
     */
    snapshotCreeps: (view) => {
      const live = utils.getObjectsByPrototype(byName.Creep);
      const count = Math.min(live.length, Math.floor(view.length / 5));

      let at = 0;
      for (let index = 0; index < count; index += 1) {
        const creep = live[index];
        view[at] = creep.x;
        view[at + 1] = creep.y;
        view[at + 2] = creep.hits;
        view[at + 3] = creep.hitsMax;
        view[at + 4] = creep.my ? 1 : 0;
        at += 5;
      }
      return count;
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
