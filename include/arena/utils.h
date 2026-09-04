#pragma once

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// Mirror of the Screeps: Arena `game/utils` module.
//
// Names match the JS API (`getTicks`, not `get_ticks`) so that the Arena docs
// read as documentation for this header too.
//
// `getRange` is not here -- it is pure geometry and lives in <arena/types.h>,
// computed in C++ rather than bridged.

#include <optional>
#include <string>
#include <vector>

#include "arena/object.h"
#include "arena/prototypes.h"
#include "arena/types.h"

namespace arena {

// The scalar half of the module needs no JS values, so it is declared for host
// builds too and `arena::testing` can fake it. Everything below the
// __EMSCRIPTEN__ guard deals in `emscripten::val` and exists only in the WASM
// build -- see the note in <arena/object.h>.

/// Number of ticks passed since the start of the game. The first is 1.
int getTicks();

/// CPU wall time elapsed in the current tick, in nanoseconds.
double getCpuTime();

/// The direction constant for a delta.
///
/// Bridged rather than reimplemented: the rounding rule that maps an arbitrary
/// delta onto eight directions is a game rule, and guessing at it would be a
/// silent source of wrong moves.
int getDirection(int dx, int dy);

/// TERRAIN_PLAIN, TERRAIN_WALL or TERRAIN_SWAMP at a position.
int getTerrainAt(Position position);

#ifdef __EMSCRIPTEN__

/// Every object in the game.
std::vector<GameObject> getObjects();

/// The object with this id, if it still exists.
template <typename T = GameObject>
std::optional<T> getObjectById(const std::string& id) {
  const emscripten::val object = detail::api().call<emscripten::val>("getObjectById", id);
  if (object.isUndefined() || object.isNull()) return std::nullopt;
  return T(object);
}

/// Every object of one prototype, e.g. `getObjectsByPrototype<Creep>()`.
///
/// This is where the per-tick snapshot is taken: one crossing copies every
/// numeric field of every object of this prototype into WASM memory, and the
/// returned objects read from there. Calling it again in the same tick is
/// nearly free -- the slice is cached.
///
/// Objects obtained any other way (`getObjectById()`, `getObjects()`) read
/// through their handles instead, which is correct but far slower per field.
template <typename T>
std::vector<T> getObjectsByPrototype() {
  const detail::Slice& slice = detail::snapshotByPrototype(T::kPrototype);

  std::vector<T> objects;
  objects.reserve(static_cast<std::size_t>(slice.count));
  for (int index = 0; index < slice.count; ++index) {
    objects.emplace_back(slice.objects[index],
                         slice.base >= 0 ? slice.base + index : -1);
  }
  return objects;
}

/// Options shared by the pathfinding helpers.
///
/// Every field is optional; leaving one unset means the game's default, so an
/// empty `FindPathOptions{}` behaves exactly like passing nothing.
struct FindPathOptions {
  /// Custom navigation costs. Build one with `CostMatrix` from <arena/path_finder.h>.
  std::optional<emscripten::val> costMatrix;
  std::optional<int> plainCost;
  std::optional<int> swampCost;
  std::optional<bool> flee;
  std::optional<int> maxOps;
  std::optional<double> maxCost;
  std::optional<double> heuristicWeight;
  /// Objects that should not count as obstacles.
  std::vector<GameObject> ignore;

  /// The JS options object, with unset fields omitted.
  emscripten::val toVal() const;
};

/// The closest of `targets` by path length, or nothing when none is reachable.
template <typename T>
std::optional<T> findClosestByPath(Position from, const std::vector<T>& targets,
                                   const FindPathOptions& options = {}) {
  const emscripten::val found = detail::api().call<emscripten::val>(
      "findClosestByPath", detail::toVal(from), detail::toValArray(targets),
      options.toVal());
  if (found.isUndefined() || found.isNull()) return std::nullopt;
  return T(found);
}

/// The closest of `targets` by linear range.
template <typename T>
std::optional<T> findClosestByRange(Position from, const std::vector<T>& targets) {
  const emscripten::val found = detail::api().call<emscripten::val>(
      "findClosestByRange", detail::toVal(from), detail::toValArray(targets));
  if (found.isUndefined() || found.isNull()) return std::nullopt;
  return T(found);
}

/// Those of `targets` within `range` squares.
template <typename T>
std::vector<T> findInRange(Position from, const std::vector<T>& targets, int range) {
  return detail::toVector<T>(detail::api().call<emscripten::val>(
      "findInRange", detail::toVal(from), detail::toValArray(targets), range));
}

/// A path from `from` to `to`. Unlike `searchPath`, this avoids obstacles by
/// default. Empty when no path exists.
std::vector<Position> findPath(Position from, Position to,
                               const FindPathOptions& options = {});

/// The result of asking for a new construction site.
struct CreateConstructionSiteResult {
  std::optional<ConstructionSite> object;
  std::optional<int> error;

  explicit operator bool() const { return !error.has_value(); }
};

/// Places a construction site. `structurePrototype` is a name such as
/// "StructureRampart", matching the prototypes in <arena/prototypes.h>.
CreateConstructionSiteResult createConstructionSite(Position position,
                                                    std::string_view structurePrototype);

// --- constants the typings declare without a value -------------------------
//
// <arena/constants.h> refuses to guess at these. They are read from the running
// game instead, and cached after the first call.

/// `OBSTACLE_OBJECT_TYPES` -- the object types that block movement.
const std::vector<std::string>& obstacleObjectTypes();

/// `RESOURCES_ALL` -- every resource type this arena defines.
const std::vector<std::string>& resourcesAll();

/// `CONSTRUCTION_COST[structurePrototype]`, or nothing if unbuildable here.
std::optional<int> constructionCost(std::string_view structurePrototype);

// --- arenaInfo -------------------------------------------------------------

/// The `arenaInfo` object the game exposes.
struct ArenaInfo {
  std::string name;
  std::string season;
  int level = 0;
  int ticksLimit = 0;

  /// Per-tick CPU allowance, in **nanoseconds** -- the same unit
  /// `getCpuTime()` reports, so the two can be compared directly.
  ///
  /// The typings give no unit. Measured on Pain and Gain, where the raw value
  /// is 1e8: 100 ms read as nanoseconds, and absurd read as anything else.
  double cpuTimeLimit = 0;

  /// The larger allowance for the first tick, also in nanoseconds. Observed as
  /// 1e9, i.e. one second -- which is where compiling the WASM belongs.
  double cpuTimeLimitFirstTick = 0;
};

/// Arena metadata. Constant for the whole match, so it is read once and cached.
const ArenaInfo& arenaInfo();

#endif  // __EMSCRIPTEN__

}  // namespace arena
