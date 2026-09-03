// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// The JS side of every call in <arena/*.h>.
//
// Everything goes through the host table injected as `Module.arena`
// (js/host.mjs), which is the single place the real game API and the simulator
// are wired up. Nothing here reaches for a global.

#include <emscripten/val.h>

#include <string>
#include <utility>
#include <vector>

#include "arena/object.h"
#include "arena/path_finder.h"
#include "arena/prototypes.h"
#include "arena/utils.h"
#include "arena/visual.h"

namespace arena {
namespace detail {
namespace {

/// Sets `key` only when `value` holds something, so the JS side sees an absent
/// option rather than a null and applies its own default.
template <typename T>
void setIfPresent(emscripten::val& target, const char* key,
                  const std::optional<T>& value) {
  if (value.has_value()) target.set(key, *value);
}

}  // namespace

const emscripten::val& api() {
  // The host table never changes during a match, and this is on the hot path of
  // every single call.
  static const emscripten::val table = emscripten::val::module_property("arena");
  return table;
}

emscripten::val toVal(Position position) {
  emscripten::val object = emscripten::val::object();
  object.set("x", position.x);
  object.set("y", position.y);
  return object;
}

std::optional<int> optionalInt(const emscripten::val& value) {
  if (value.isUndefined() || value.isNull()) return std::nullopt;
  return value.as<int>();
}

}  // namespace detail

// --- GameObject ------------------------------------------------------------

std::vector<Effect> GameObject::effects() const {
  const emscripten::val list = handle_["effects"];
  if (list.isUndefined() || list.isNull()) return {};

  const unsigned length = list["length"].as<unsigned>();
  std::vector<Effect> effects;
  effects.reserve(length);

  for (unsigned index = 0; index < length; ++index) {
    const emscripten::val entry = list[index];
    Effect effect;
    effect.effectType = entry["effectType"].as<std::string>();

    const emscripten::val data = entry["data"];
    if (!data.isUndefined() && !data.isNull()) {
      const emscripten::val multiplier = data["multiplier"];
      const emscripten::val offset = data["offset"];
      if (!multiplier.isUndefined() && !multiplier.isNull()) {
        effect.data.multiplier = multiplier.as<double>();
      }
      if (!offset.isUndefined() && !offset.isNull()) {
        effect.data.offset = offset.as<double>();
      }
    }

    effect.endTime = detail::optionalInt(entry["endTime"]).value_or(0);
    effects.push_back(std::move(effect));
  }
  return effects;
}

// --- Creep -----------------------------------------------------------------

std::vector<BodyPart> Creep::body() const {
  const emscripten::val list = handle_["body"];
  if (list.isUndefined() || list.isNull()) return {};

  const unsigned length = list["length"].as<unsigned>();
  std::vector<BodyPart> parts;
  parts.reserve(length);
  for (unsigned index = 0; index < length; ++index) {
    const emscripten::val entry = list[index];
    parts.push_back({entry["type"].as<std::string>(), entry["hits"].as<int>()});
  }
  return parts;
}

int Creep::countParts(std::string_view type) const {
  const emscripten::val list = handle_["body"];
  if (list.isUndefined() || list.isNull()) return 0;

  const unsigned length = list["length"].as<unsigned>();
  const std::string wanted(type);
  int count = 0;
  for (unsigned index = 0; index < length; ++index) {
    const emscripten::val entry = list[index];
    // A part with no hits left is destroyed and no longer does anything.
    if (entry["hits"].as<int>() > 0 && entry["type"].as<std::string>() == wanted) {
      ++count;
    }
  }
  return count;
}

// --- StructureSpawn --------------------------------------------------------

std::vector<int> StructureSpawn::directions() const {
  const emscripten::val list = handle_["directions"];
  if (list.isUndefined() || list.isNull()) return {};

  const unsigned length = list["length"].as<unsigned>();
  std::vector<int> directions;
  directions.reserve(length);
  for (unsigned index = 0; index < length; ++index) {
    directions.push_back(list[index].as<int>());
  }
  return directions;
}

int StructureSpawn::setDirections(const std::vector<int>& directions) const {
  emscripten::val array = emscripten::val::array();
  for (std::size_t index = 0; index < directions.size(); ++index) {
    array.set(index, directions[index]);
  }
  return handle_.call<int>("setDirections", array);
}

SpawnCreepResult StructureSpawn::spawnCreep(const std::vector<std::string>& body) const {
  emscripten::val array = emscripten::val::array();
  for (std::size_t index = 0; index < body.size(); ++index) {
    array.set(index, body[index]);
  }

  const emscripten::val result = handle_.call<emscripten::val>("spawnCreep", array);

  SpawnCreepResult spawned;
  if (result.isUndefined() || result.isNull()) return spawned;

  const emscripten::val object = result["object"];
  if (!object.isUndefined() && !object.isNull()) spawned.object = Creep(object);
  spawned.error = detail::optionalInt(result["error"]);
  return spawned;
}

// --- utils -----------------------------------------------------------------

int getTicks() { return detail::api().call<int>("getTicks"); }

double getCpuTime() { return detail::api().call<double>("getCpuTime"); }

int getDirection(int dx, int dy) {
  return detail::api().call<int>("getDirection", dx, dy);
}

int getTerrainAt(Position position) {
  return detail::api().call<int>("getTerrainAt", detail::toVal(position));
}

std::vector<GameObject> getObjects() {
  return detail::toVector<GameObject>(
      detail::api().call<emscripten::val>("getObjects"));
}

emscripten::val FindPathOptions::toVal() const {
  emscripten::val options = emscripten::val::object();
  if (costMatrix.has_value()) options.set("costMatrix", *costMatrix);
  detail::setIfPresent(options, "plainCost", plainCost);
  detail::setIfPresent(options, "swampCost", swampCost);
  detail::setIfPresent(options, "flee", flee);
  detail::setIfPresent(options, "maxOps", maxOps);
  detail::setIfPresent(options, "maxCost", maxCost);
  detail::setIfPresent(options, "heuristicWeight", heuristicWeight);
  if (!ignore.empty()) options.set("ignore", detail::toValArray(ignore));
  return options;
}

std::vector<Position> findPath(Position from, Position to,
                               const FindPathOptions& options) {
  const emscripten::val path = detail::api().call<emscripten::val>(
      "findPath", detail::toVal(from), detail::toVal(to), options.toVal());
  if (path.isUndefined() || path.isNull()) return {};

  const unsigned length = path["length"].as<unsigned>();
  std::vector<Position> positions;
  positions.reserve(length);
  for (unsigned index = 0; index < length; ++index) {
    const emscripten::val point = path[index];
    positions.push_back({point["x"].as<int>(), point["y"].as<int>()});
  }
  return positions;
}

CreateConstructionSiteResult createConstructionSite(Position position,
                                                    std::string_view structurePrototype) {
  const emscripten::val result = detail::api().call<emscripten::val>(
      "createConstructionSite", detail::toVal(position),
      std::string(structurePrototype));

  CreateConstructionSiteResult created;
  if (result.isUndefined() || result.isNull()) return created;

  const emscripten::val object = result["object"];
  if (!object.isUndefined() && !object.isNull()) {
    created.object = ConstructionSite(object);
  }
  created.error = detail::optionalInt(result["error"]);
  return created;
}

namespace {

std::vector<std::string> readStringArray(const char* name) {
  const emscripten::val list = detail::api()[name];
  if (list.isUndefined() || list.isNull()) return {};

  const unsigned length = list["length"].as<unsigned>();
  std::vector<std::string> values;
  values.reserve(length);
  for (unsigned index = 0; index < length; ++index) {
    values.push_back(list[index].as<std::string>());
  }
  return values;
}

}  // namespace

const std::vector<std::string>& obstacleObjectTypes() {
  static const std::vector<std::string> types = readStringArray("OBSTACLE_OBJECT_TYPES");
  return types;
}

const std::vector<std::string>& resourcesAll() {
  static const std::vector<std::string> types = readStringArray("RESOURCES_ALL");
  return types;
}

std::optional<int> constructionCost(std::string_view structurePrototype) {
  const emscripten::val costs = detail::api()["CONSTRUCTION_COST"];
  if (costs.isUndefined() || costs.isNull()) return std::nullopt;
  return detail::optionalInt(costs[std::string(structurePrototype)]);
}

const ArenaInfo& arenaInfo() {
  // Fixed for the whole match.
  static const ArenaInfo info = [] {
    const emscripten::val raw = detail::api()["arenaInfo"];
    ArenaInfo parsed;
    if (raw.isUndefined() || raw.isNull()) return parsed;

    parsed.name = raw["name"].as<std::string>();
    parsed.season = raw["season"].as<std::string>();
    parsed.level = raw["level"].as<int>();
    parsed.ticksLimit = raw["ticksLimit"].as<int>();
    parsed.cpuTimeLimit = raw["cpuTimeLimit"].as<double>();
    parsed.cpuTimeLimitFirstTick = raw["cpuTimeLimitFirstTick"].as<double>();
    return parsed;
  }();
  return info;
}

// --- path finder -----------------------------------------------------------

CostMatrix::CostMatrix()
    : handle_(detail::api()["CostMatrix"].new_()) {}

emscripten::val SearchPathOptions::toVal() const {
  emscripten::val options = emscripten::val::object();
  if (costMatrix.has_value()) options.set("costMatrix", costMatrix->handle());
  detail::setIfPresent(options, "plainCost", plainCost);
  detail::setIfPresent(options, "swampCost", swampCost);
  detail::setIfPresent(options, "flee", flee);
  detail::setIfPresent(options, "maxOps", maxOps);
  detail::setIfPresent(options, "maxCost", maxCost);
  detail::setIfPresent(options, "heuristicWeight", heuristicWeight);
  return options;
}

SearchPathResult searchPath(Position origin, const std::vector<Goal>& goals,
                            const SearchPathOptions& options) {
  emscripten::val targets = emscripten::val::array();
  for (std::size_t index = 0; index < goals.size(); ++index) {
    emscripten::val goal = emscripten::val::object();
    goal.set("pos", detail::toVal(goals[index].pos));
    goal.set("range", goals[index].range);
    targets.set(index, goal);
  }

  const emscripten::val result = detail::api().call<emscripten::val>(
      "searchPath", detail::toVal(origin), targets, options.toVal());

  SearchPathResult parsed;
  if (result.isUndefined() || result.isNull()) return parsed;

  const emscripten::val path = result["path"];
  if (!path.isUndefined() && !path.isNull()) {
    const unsigned length = path["length"].as<unsigned>();
    parsed.path.reserve(length);
    for (unsigned index = 0; index < length; ++index) {
      const emscripten::val point = path[index];
      parsed.path.push_back({point["x"].as<int>(), point["y"].as<int>()});
    }
  }
  parsed.ops = detail::optionalInt(result["ops"]).value_or(0);
  parsed.cost = detail::optionalInt(result["cost"]).value_or(0);

  const emscripten::val incomplete = result["incomplete"];
  parsed.incomplete = !incomplete.isUndefined() && !incomplete.isNull() &&
                      incomplete.as<bool>();
  return parsed;
}

SearchPathResult searchPath(Position origin, Goal goal,
                            const SearchPathOptions& options) {
  return searchPath(origin, std::vector<Goal>{goal}, options);
}

// --- visual ----------------------------------------------------------------

emscripten::val CircleStyle::toVal() const {
  emscripten::val style = emscripten::val::object();
  detail::setIfPresent(style, "radius", radius);
  detail::setIfPresent(style, "fill", fill);
  detail::setIfPresent(style, "opacity", opacity);
  detail::setIfPresent(style, "stroke", stroke);
  detail::setIfPresent(style, "strokeWidth", strokeWidth);
  detail::setIfPresent(style, "lineStyle", lineStyle);
  return style;
}

emscripten::val LineStyle::toVal() const {
  emscripten::val style = emscripten::val::object();
  detail::setIfPresent(style, "width", width);
  detail::setIfPresent(style, "color", color);
  detail::setIfPresent(style, "opacity", opacity);
  detail::setIfPresent(style, "lineStyle", lineStyle);
  return style;
}

emscripten::val ShapeStyle::toVal() const {
  emscripten::val style = emscripten::val::object();
  detail::setIfPresent(style, "fill", fill);
  detail::setIfPresent(style, "opacity", opacity);
  detail::setIfPresent(style, "stroke", stroke);
  detail::setIfPresent(style, "strokeWidth", strokeWidth);
  detail::setIfPresent(style, "lineStyle", lineStyle);
  return style;
}

emscripten::val TextStyle::toVal() const {
  emscripten::val style = emscripten::val::object();
  detail::setIfPresent(style, "align", align);
  detail::setIfPresent(style, "backgroundColor", backgroundColor);
  detail::setIfPresent(style, "backgroundPadding", backgroundPadding);
  detail::setIfPresent(style, "color", color);
  detail::setIfPresent(style, "font", font);
  detail::setIfPresent(style, "opacity", opacity);
  detail::setIfPresent(style, "stroke", stroke);
  detail::setIfPresent(style, "strokeWidth", strokeWidth);
  return style;
}

Visual::Visual(int layer, bool persistent)
    : handle_(detail::api()["Visual"].new_(layer, persistent)) {}

const Visual& Visual::clear() const {
  handle_.call<emscripten::val>("clear");
  return *this;
}

const Visual& Visual::circle(Position position, const CircleStyle& style) const {
  handle_.call<emscripten::val>("circle", detail::toVal(position), style.toVal());
  return *this;
}

const Visual& Visual::line(Position from, Position to, const LineStyle& style) const {
  handle_.call<emscripten::val>("line", detail::toVal(from), detail::toVal(to),
                                style.toVal());
  return *this;
}

const Visual& Visual::poly(const std::vector<Position>& points,
                           const PolyStyle& style) const {
  emscripten::val array = emscripten::val::array();
  for (std::size_t index = 0; index < points.size(); ++index) {
    array.set(index, detail::toVal(points[index]));
  }
  handle_.call<emscripten::val>("poly", array, style.toVal());
  return *this;
}

const Visual& Visual::rect(Position topLeft, int width, int height,
                           const RectStyle& style) const {
  handle_.call<emscripten::val>("rect", detail::toVal(topLeft), width, height,
                                style.toVal());
  return *this;
}

const Visual& Visual::text(const std::string& text, Position position,
                           const TextStyle& style) const {
  handle_.call<emscripten::val>("text", text, detail::toVal(position), style.toVal());
  return *this;
}

}  // namespace arena
