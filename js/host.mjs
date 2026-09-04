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
 * One loop per field. **Not the default** -- see `snapshotField` below.
 *
 * Written on the theory that sharing one loop across every field makes its
 * inner call site megamorphic and stops V8 inlining the accessor. Measured on
 * the real game, it was 60% *slower* than the shared loop: 86,136 ns against
 * 53,746 ns for a cold first pass. The likely reason is the opposite of the
 * theory -- one shared function called 1,000 times a run tiers up, while
 * eighteen functions called 200 times each stay in the interpreter.
 *
 * Kept so `bench/` can measure both rather than argue about it.
 *
 * @param {object[]} o  the objects
 * @param {Int32Array} v  the record buffer
 * @param {number} s  this field's slot within a record
 * @param {number} n  fields per record
 */
/**
 * How to read each slot. `store` is passed in so it is fetched at most once.
 *
 * Driven by the shared loop in `snapshotField`, which is the default: on the
 * real game it beat one loop per field, apparently because a single function
 * called often enough gets optimised while many rarely-called ones do not.
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
 * Every field a Creep has, written by one loop.
 *
 * A third candidate for filling the snapshot, kept alongside the other two so
 * `bench/` can settle which is fastest on the real game rather than reasoning
 * about V8. This one reads more fields than a bot may want, but does it in a
 * single hot function and a single crossing.
 */
function writeCreepFields(objects, view, stride, slots) {
  for (let i = 0; i < objects.length; i += 1) {
    const o = objects[i];
    const at = i * stride;
    const store = o.store;
    view[at + slots.x] = numeric(o.x);
    view[at + slots.y] = numeric(o.y);
    view[at + slots.exists] = flag(o.exists);
    view[at + slots.hits] = numeric(o.hits);
    view[at + slots.hitsMax] = numeric(o.hitsMax);
    view[at + slots.my] = flag(o.my);
    view[at + slots.fatigue] = numeric(o.fatigue);
    view[at + slots.spawning] = flag(o.spawning);
    view[at + slots.storeEnergy] = store ? numeric(store.energy) : ABSENT;
  }
}

/** Slot index by field name. */
const SLOT = Object.fromEntries(SNAPSHOT_FIELDS.map((name, index) => [name, index]));

const COLUMN_WRITERS = {
  x: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].x); },
  y: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].y); },
  exists: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = flag(o[i].exists); },
  ticksToDecay: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].ticksToDecay); },
  hits: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].hits); },
  hitsMax: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].hitsMax); },
  my: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = flag(o[i].my); },
  fatigue: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].fatigue); },
  spawning: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = flag(o[i].spawning); },
  energy: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].energy); },
  energyCapacity: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].energyCapacity); },
  amount: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].amount); },
  progress: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].progress); },
  progressTotal: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].progressTotal); },
  cooldown: (o, v, s, n) => { for (let i = 0; i < o.length; i += 1) v[i * n + s] = numeric(o[i].cooldown); },

  // The store is a nested object, so these read two deep. `getCapacity` and
  // `getUsedCapacity` are method calls rather than property reads, which is why
  // a bot that only wants `store.energy` never triggers them.
  storeEnergy: (o, v, s, n) => {
    for (let i = 0; i < o.length; i += 1) {
      const store = o[i].store;
      v[i * n + s] = store ? numeric(store.energy) : ABSENT;
    }
  },
  storeCapacity: (o, v, s, n) => {
    for (let i = 0; i < o.length; i += 1) {
      const store = o[i].store;
      v[i * n + s] = store ? numeric(store.getCapacity('energy')) : ABSENT;
    }
  },
  storeUsed: (o, v, s, n) => {
    for (let i = 0; i < o.length; i += 1) {
      const store = o[i].store;
      v[i * n + s] = store ? numeric(store.getUsedCapacity('energy')) : ABSENT;
    }
  },
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

    // --- benchmark-only alternatives ---------------------------------------
    //
    // Two other ways to fill the snapshot, exposed so bench/ can measure all
    // three in one deploy instead of shipping a guess and waiting a round trip
    // to find out it was wrong. Not used by the library.

    /** One monomorphic loop per field. */
    benchSnapshotFieldMono: (objects, field, view, slot, stride) => {
      COLUMN_WRITERS[field](objects, view, slot, stride);
    },

    /** Every Creep field in one loop and one crossing. */
    benchSnapshotCreepFields: (objects, view, stride) => {
      writeCreepFields(objects, view, stride, SLOT);
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
