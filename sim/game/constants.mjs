/**
 * Simulated `game/constants`.
 *
 * Values must match `include/arena/constants.h` exactly -- `tests/constants.test.mjs`
 * parses the header and compares, so a change on one side fails the build
 * rather than producing a simulator that disagrees with the bot.
 */

// --- result codes -----------------------------------------------------------
export const OK = 0;
export const ERR_NOT_OWNER = -1;
export const ERR_NO_PATH = -2;
export const ERR_NAME_EXISTS = -3;
export const ERR_BUSY = -4;
export const ERR_NOT_FOUND = -5;
export const ERR_NOT_ENOUGH_ENERGY = -6;
export const ERR_NOT_ENOUGH_RESOURCES = -6;
export const ERR_NOT_ENOUGH_EXTENSIONS = -6;
export const ERR_INVALID_TARGET = -7;
export const ERR_FULL = -8;
export const ERR_NOT_IN_RANGE = -9;
export const ERR_INVALID_ARGS = -10;
export const ERR_TIRED = -11;
export const ERR_NO_BODYPART = -12;

// --- body parts -------------------------------------------------------------
export const MOVE = 'move';
export const RANGED_ATTACK = 'ranged_attack';
export const HEAL = 'heal';
export const ATTACK = 'attack';
export const CARRY = 'carry';
export const TOUGH = 'tough';
export const WORK = 'work';

// --- directions -------------------------------------------------------------
export const TOP = 1;
export const TOP_RIGHT = 2;
export const RIGHT = 3;
export const BOTTOM_RIGHT = 4;
export const BOTTOM = 5;
export const BOTTOM_LEFT = 6;
export const LEFT = 7;
export const TOP_LEFT = 8;

/** Delta for each direction constant, indexed by the constant itself. */
export const DIRECTION_DELTA = {
  [TOP]: { dx: 0, dy: -1 },
  [TOP_RIGHT]: { dx: 1, dy: -1 },
  [RIGHT]: { dx: 1, dy: 0 },
  [BOTTOM_RIGHT]: { dx: 1, dy: 1 },
  [BOTTOM]: { dx: 0, dy: 1 },
  [BOTTOM_LEFT]: { dx: -1, dy: 1 },
  [LEFT]: { dx: -1, dy: 0 },
  [TOP_LEFT]: { dx: -1, dy: -1 },
};

// --- terrain ----------------------------------------------------------------
export const TERRAIN_PLAIN = 0;
export const TERRAIN_WALL = 1;
export const TERRAIN_SWAMP = 2;

// --- combat and work --------------------------------------------------------
export const BODYPART_HITS = 100;

export const RANGED_ATTACK_POWER = 10;
export const ATTACK_POWER = 30;
export const HEAL_POWER = 12;
export const RANGED_HEAL_POWER = 4;
export const CARRY_CAPACITY = 50;
export const REPAIR_POWER = 100;
export const DISMANTLE_POWER = 50;
export const REPAIR_COST = 0.01;
export const DISMANTLE_COST = 0.005;
export const HARVEST_POWER = 2;
export const BUILD_POWER = 5;

// --- towers -----------------------------------------------------------------
export const TOWER_ENERGY_COST = 10;
export const TOWER_RANGE = 20;
export const TOWER_HITS = 3000;
export const TOWER_CAPACITY = 10;
export const TOWER_POWER_ATTACK = 1000;
export const TOWER_POWER_HEAL = 600;
export const TOWER_POWER_REPAIR = 200;
export const TOWER_OPTIMAL_RANGE = 1;
export const TOWER_FALLOFF_RANGE = 20;
export const TOWER_FALLOFF = 1;
export const TOWER_COOLDOWN = 10;

// --- creeps -----------------------------------------------------------------
export const MAX_CREEP_SIZE = 50;
export const CREEP_SPAWN_TIME = 3;

// --- resources --------------------------------------------------------------
export const RESOURCE_ENERGY = 'energy';
export const RESOURCES_ALL = [RESOURCE_ENERGY];
export const SOURCE_ENERGY_REGEN = 10;
export const RESOURCE_DECAY = 1000;

// --- construction -----------------------------------------------------------
export const MAX_CONSTRUCTION_SITES = 10;
export const CONSTRUCTION_COST_ROAD_SWAMP_RATIO = 5;
export const CONSTRUCTION_COST_ROAD_WALL_RATIO = 150;

// --- structures -------------------------------------------------------------
export const CONTAINER_HITS = 300;
export const CONTAINER_CAPACITY = 2000;
export const WALL_HITS = 10000;
export const WALL_HITS_MAX = 10000;
export const RAMPART_HITS = 10000;
export const RAMPART_HITS_MAX = 10000;
export const ROAD_HITS = 500;
export const ROAD_WEAROUT = 1;
export const EXTENSION_HITS = 100;
export const EXTENSION_ENERGY_CAPACITY = 100;
export const SPAWN_ENERGY_CAPACITY = 1000;
export const SPAWN_HITS = 3000;

// --- effects ----------------------------------------------------------------
export const EFF_CONSTRUCTION_BOOST = 'eff_construction_boost';
export const EFF_HEAL_BOOST = 'eff_heal_boost';
export const EFF_RANGED_ATTACK_BOOST = 'eff_ranged_attack_boost';
export const EFF_ATTACK_BOOST = 'eff_attack_boost';
export const EFF_WORK_BOOST = 'eff_work_boost';
export const EFF_MOVE_BOOST = 'eff_move_boost';
export const EFF_ATTACK_MODIFIER = 'eff_attack_modifier';
export const EFF_RANGED_ATTACK_MODIFIER = 'eff_ranged_attack_modifier';
export const EFF_HEAL_MODIFIER = 'eff_heal_modifier';
export const EFF_DAMAGE_TAKEN_MODIFIER = 'eff_damage_taken_modifier';
export const EFF_FATIGUE_MODIFIER = 'eff_fatigue_modifier';
export const EFF_HITS_LOSS = 'eff_hits_loss';

// ============================================================================
// Measured, not declared. See include/arena/constants.h for the method behind
// each of these; they are what the engine in sim/engine.mjs runs on.
// ============================================================================

export const BODYPART_COST = {
  [MOVE]: 50,
  [CARRY]: 50,
  [TOUGH]: 10,
  [ATTACK]: 80,
  [WORK]: 100,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
};

/** Applies to `rangedMassAttack` only; `rangedAttack` has no falloff. */
export const RANGED_ATTACK_DISTANCE_RATE = { 1: 1, 2: 0.4, 3: 0.1 };

export const SPAWN_ENERGY_REGEN = 1;
export const FATIGUE_PER_WEIGHT = 2;
export const FATIGUE_RECOVERY_PER_MOVE = 2;
export const TERRAIN_MOVE_COST = { [TERRAIN_PLAIN]: 1, [TERRAIN_SWAMP]: 5 };

/**
 * Object types that block movement.
 *
 * The typings declare `OBSTACLE_OBJECT_TYPES` with no value, and this list has
 * not been verified against a real arena -- it is what the engine here assumes,
 * not a claim about the game. `arena::obstacleObjectTypes()` reads the real one
 * at runtime; prefer that in a bot.
 */
export const OBSTACLE_OBJECT_TYPES = [
  'creep',
  'constructedWall',
  'spawn',
  'extension',
  'tower',
];

/** Energy cost of a construction site by prototype name. Unverified, as above. */
export const CONSTRUCTION_COST = {
  StructureRampart: 1,
  StructureRoad: 300,
  StructureExtension: 3000,
  StructureContainer: 5000,
  StructureTower: 5000,
  StructureSpawn: 15000,
  StructureWall: 1,
};
