#pragma once

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// Mirror of the Screeps: Arena `game/constants` module.
//
// Values are transcribed from the typings the Arena client installs
// (`typings/game/constants.d.ts`, version 1.3.0), not from the public web
// documentation -- the two have disagreed before, notably on the TOWER_*
// numbers. `tests/constants_test.cc` and `sim/game/constants.mjs` are checked
// against this header, so a re-vendoring that changes a value shows up as a
// test failure rather than as a bot that quietly mis-plans.

#include <array>
#include <string_view>

namespace arena {

// --- result codes ---------------------------------------------------------
inline constexpr int OK = 0;
inline constexpr int ERR_NOT_OWNER = -1;
inline constexpr int ERR_NO_PATH = -2;
inline constexpr int ERR_NAME_EXISTS = -3;
inline constexpr int ERR_BUSY = -4;
inline constexpr int ERR_NOT_FOUND = -5;
inline constexpr int ERR_NOT_ENOUGH_ENERGY = -6;
inline constexpr int ERR_NOT_ENOUGH_RESOURCES = -6;
inline constexpr int ERR_NOT_ENOUGH_EXTENSIONS = -6;
inline constexpr int ERR_INVALID_TARGET = -7;
inline constexpr int ERR_FULL = -8;
inline constexpr int ERR_NOT_IN_RANGE = -9;
inline constexpr int ERR_INVALID_ARGS = -10;
inline constexpr int ERR_TIRED = -11;
inline constexpr int ERR_NO_BODYPART = -12;

// --- body parts -----------------------------------------------------------
// Strings in the JS API, so strings here too: they are passed straight through
// to `spawnCreep()` and compared against `Creep::body()`.
inline constexpr std::string_view MOVE = "move";
inline constexpr std::string_view RANGED_ATTACK = "ranged_attack";
inline constexpr std::string_view HEAL = "heal";
inline constexpr std::string_view ATTACK = "attack";
inline constexpr std::string_view CARRY = "carry";
inline constexpr std::string_view TOUGH = "tough";
inline constexpr std::string_view WORK = "work";

// --- directions -----------------------------------------------------------
inline constexpr int TOP = 1;
inline constexpr int TOP_RIGHT = 2;
inline constexpr int RIGHT = 3;
inline constexpr int BOTTOM_RIGHT = 4;
inline constexpr int BOTTOM = 5;
inline constexpr int BOTTOM_LEFT = 6;
inline constexpr int LEFT = 7;
inline constexpr int TOP_LEFT = 8;

// --- terrain --------------------------------------------------------------
inline constexpr int TERRAIN_PLAIN = 0;
inline constexpr int TERRAIN_WALL = 1;
inline constexpr int TERRAIN_SWAMP = 2;

// --- combat and work ------------------------------------------------------
inline constexpr int BODYPART_HITS = 100;

inline constexpr int RANGED_ATTACK_POWER = 10;
inline constexpr int ATTACK_POWER = 30;
inline constexpr int HEAL_POWER = 12;
inline constexpr int RANGED_HEAL_POWER = 4;
inline constexpr int CARRY_CAPACITY = 50;
inline constexpr int REPAIR_POWER = 100;
inline constexpr int DISMANTLE_POWER = 50;
inline constexpr double REPAIR_COST = 0.01;
inline constexpr double DISMANTLE_COST = 0.005;
inline constexpr int HARVEST_POWER = 2;
inline constexpr int BUILD_POWER = 5;


// --- towers ---------------------------------------------------------------
inline constexpr int TOWER_ENERGY_COST = 10;
inline constexpr int TOWER_RANGE = 20;
inline constexpr int TOWER_HITS = 3000;
inline constexpr int TOWER_CAPACITY = 10;
inline constexpr int TOWER_POWER_ATTACK = 1000;
inline constexpr int TOWER_POWER_HEAL = 600;
inline constexpr int TOWER_POWER_REPAIR = 200;
inline constexpr int TOWER_OPTIMAL_RANGE = 1;
inline constexpr int TOWER_FALLOFF_RANGE = 20;
inline constexpr double TOWER_FALLOFF = 1;
inline constexpr int TOWER_COOLDOWN = 10;

// --- creeps ---------------------------------------------------------------
inline constexpr int MAX_CREEP_SIZE = 50;
inline constexpr int CREEP_SPAWN_TIME = 3;

// --- resources ------------------------------------------------------------
inline constexpr std::string_view RESOURCE_ENERGY = "energy";
inline constexpr int SOURCE_ENERGY_REGEN = 10;
inline constexpr int RESOURCE_DECAY = 1000;

// --- construction ---------------------------------------------------------
inline constexpr int MAX_CONSTRUCTION_SITES = 10;
inline constexpr int CONSTRUCTION_COST_ROAD_SWAMP_RATIO = 5;
inline constexpr int CONSTRUCTION_COST_ROAD_WALL_RATIO = 150;

// --- structures -----------------------------------------------------------
inline constexpr int CONTAINER_HITS = 300;
inline constexpr int CONTAINER_CAPACITY = 2000;

inline constexpr int WALL_HITS = 10000;
inline constexpr int WALL_HITS_MAX = 10000;

inline constexpr int RAMPART_HITS = 10000;
inline constexpr int RAMPART_HITS_MAX = 10000;

inline constexpr int ROAD_HITS = 500;
inline constexpr int ROAD_WEAROUT = 1;

inline constexpr int EXTENSION_HITS = 100;
inline constexpr int EXTENSION_ENERGY_CAPACITY = 100;

inline constexpr int SPAWN_ENERGY_CAPACITY = 1000;
inline constexpr int SPAWN_HITS = 3000;

// --- effects --------------------------------------------------------------
inline constexpr std::string_view EFF_CONSTRUCTION_BOOST = "eff_construction_boost";
inline constexpr std::string_view EFF_HEAL_BOOST = "eff_heal_boost";
inline constexpr std::string_view EFF_RANGED_ATTACK_BOOST = "eff_ranged_attack_boost";
inline constexpr std::string_view EFF_ATTACK_BOOST = "eff_attack_boost";
inline constexpr std::string_view EFF_WORK_BOOST = "eff_work_boost";
inline constexpr std::string_view EFF_MOVE_BOOST = "eff_move_boost";
inline constexpr std::string_view EFF_ATTACK_MODIFIER = "eff_attack_modifier";
inline constexpr std::string_view EFF_RANGED_ATTACK_MODIFIER = "eff_ranged_attack_modifier";
inline constexpr std::string_view EFF_HEAL_MODIFIER = "eff_heal_modifier";
inline constexpr std::string_view EFF_DAMAGE_TAKEN_MODIFIER = "eff_damage_taken_modifier";
inline constexpr std::string_view EFF_FATIGUE_MODIFIER = "eff_fatigue_modifier";
inline constexpr std::string_view EFF_HITS_LOSS = "eff_hits_loss";

// ==========================================================================
// Measured, not declared.
//
// The typings declare these with a type but no value, or omit them entirely.
// The numbers below were measured in real matches; the method is recorded
// against each one so a future reader can re-run it rather than trust it.
//
// Provenance: arukuka/screeps-arena-bot `src/constants.ts`.
//
// For the remaining value-less declarations -- OBSTACLE_OBJECT_TYPES,
// RESOURCES_ALL, CONSTRUCTION_COST, STRUCTURE_PROTOTYPES -- this library does
// not guess. Read them from the running game with the accessors in
// <arena/utils.h>.
// ==========================================================================

/// Energy cost of one body part.
///
/// Measured by spawning single-part creeps and differencing the owner's total
/// spawn+extension energy. Raw readings came out 1 low every time because the
/// spawn regenerates on the same tick (see `SPAWN_ENERGY_REGEN`); corrected,
/// they match the Screeps World table exactly.
constexpr int bodyPartCost(std::string_view part) {
  if (part == MOVE) return 50;
  if (part == CARRY) return 50;
  if (part == TOUGH) return 10;
  if (part == ATTACK) return 80;
  if (part == WORK) return 100;
  if (part == RANGED_ATTACK) return 150;
  if (part == HEAL) return 250;
  return 0;
}

/// Damage rate of `rangedMassAttack` by range, measured 10 / 4 / 1 against a
/// baseline of one RANGED_ATTACK part.
///
/// This does **not** apply to `rangedAttack`, which was measured to deal
/// `RANGED_ATTACK_POWER * parts` at every range from 1 to 3 with no falloff.
/// Range 0 is unobservable: you cannot stand on an enemy.
constexpr double rangedMassAttackRate(int range) {
  switch (range) {
    case 1: return 1.0;
    case 2: return 0.4;
    case 3: return 0.1;
    default: return 0.0;
  }
}

/// `rangedAttack` has no distance falloff. Measured: one RANGED_ATTACK part
/// dealt exactly 10 damage at range 2 and at range 3.
inline constexpr bool RANGED_ATTACK_HAS_NO_FALLOFF = true;

/// Energy a spawn regenerates per tick, capped at `SPAWN_ENERGY_CAPACITY`.
///
/// Neither the typings nor the web documentation give a constant for this; the
/// spawn description only says "auto-regenerate a little amount of energy each
/// tick". Measured at exactly 54 energy over 54 ticks. Observed to stop at
/// 1000 and never overflow into extensions.
inline constexpr int SPAWN_ENERGY_REGEN = 1;

// Movement fatigue. Not published as constants; identified by walking a
// [move, attack] creep in a straight line and recording fatigue each tick:
//
//   on moving:      fatigue += FATIGUE_PER_WEIGHT * non-move parts * terrain
//   start of tick:  fatigue -= FATIGUE_RECOVERY_PER_MOVE * move parts
//   a creep with fatigue > 0 cannot move
//
// Fatigue is charged for the tile being **entered**, not the one being left.
inline constexpr int FATIGUE_PER_WEIGHT = 2;
inline constexpr int FATIGUE_RECOVERY_PER_MOVE = 2;

/// Terrain multiplier for movement cost.
///
/// Roads are unmeasured -- the arenas this was measured in have none. Screeps
/// World uses 0.5, and that is probably right, but it is a guess until someone
/// checks.
constexpr int terrainMoveCost(int terrain) {
  return terrain == TERRAIN_SWAMP ? 5 : 1;
}

}  // namespace arena
