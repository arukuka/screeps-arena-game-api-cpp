#pragma once

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// Mirror of `game/prototypes`.
//
// Properties are methods here (see <arena/object.h> for why). Action methods
// return the game's own result code, so the usual Screeps shape works
// unchanged:
//
//     if (creep.harvest(source) == ERR_NOT_IN_RANGE) creep.moveTo(source);

#ifdef __EMSCRIPTEN__

#include <emscripten/val.h>

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "arena/object.h"

namespace arena {

class Creep;
class Structure;
class ConstructionSite;

/// Base of all structures.
class Structure : public GameObject {
 public:
  static constexpr const char* kPrototype = "Structure";
  using GameObject::GameObject;

  std::optional<int> hits() const { return optionalScalar(detail::Field::kHits, "hits"); }
  std::optional<int> hitsMax() const {
    return optionalScalar(detail::Field::kHitsMax, "hitsMax");
  }
};

/// A structure that belongs to somebody.
class OwnedStructure : public Structure {
 public:
  static constexpr const char* kPrototype = "OwnedStructure";
  using Structure::Structure;

  /// true for yours, false for hostile, absent for neutral.
  std::optional<bool> my() const { return optionalFlag(detail::Field::kMy, "my"); }
};

/// An energy source. Harvestable by creeps with a WORK part.
class Source : public GameObject {
 public:
  static constexpr const char* kPrototype = "Source";
  using GameObject::GameObject;

  int energy() const { return scalar(detail::Field::kEnergy, "energy"); }
  int energyCapacity() const {
    return scalar(detail::Field::kEnergyCapacity, "energyCapacity");
  }
};

/// A dropped pile of resource.
class Resource : public GameObject {
 public:
  static constexpr const char* kPrototype = "Resource";
  using GameObject::GameObject;

  int amount() const { return scalar(detail::Field::kAmount, "amount"); }
  std::string resourceType() const { return handle_["resourceType"].as<std::string>(); }
};

/// A flag. The objective in the arenas that have them.
class Flag : public GameObject {
 public:
  static constexpr const char* kPrototype = "Flag";
  using GameObject::GameObject;

  /// true/false when owned, absent when neutral.
  std::optional<bool> my() const { return optionalFlag(detail::Field::kMy, "my"); }
};

/// A structure under construction.
class ConstructionSite : public GameObject {
 public:
  static constexpr const char* kPrototype = "ConstructionSite";
  using GameObject::GameObject;

  std::optional<int> progress() const {
    return optionalScalar(detail::Field::kProgress, "progress");
  }
  std::optional<int> progressTotal() const {
    return optionalScalar(detail::Field::kProgressTotal, "progressTotal");
  }

  std::optional<bool> my() const { return optionalFlag(detail::Field::kMy, "my"); }

  /// The structure this becomes once finished, if the game exposes it yet.
  std::optional<Structure> structure() const {
    const emscripten::val value = handle_["structure"];
    if (value.isUndefined() || value.isNull()) return std::nullopt;
    return Structure(value);
  }

  void remove() const { handle_.call<void>("remove"); }
};

/// A creep: the only thing that moves.
class Creep : public GameObject {
 public:
  static constexpr const char* kPrototype = "Creep";
  using GameObject::GameObject;

  std::vector<BodyPart> body() const;

  int fatigue() const { return scalar(detail::Field::kFatigue, "fatigue"); }
  int hits() const { return scalar(detail::Field::kHits, "hits"); }
  int hitsMax() const { return scalar(detail::Field::kHitsMax, "hitsMax"); }

  bool my() const {
    const std::int32_t value = snapshot(detail::Field::kMy);
    return value != detail::kAbsent ? value != 0 : handle_["my"].as<bool>();
  }
  bool spawning() const {
    const std::int32_t value = snapshot(detail::Field::kSpawning);
    return value != detail::kAbsent ? value != 0 : handle_["spawning"].as<bool>();
  }

  Store store() const { return Store(handle_, slice_, index_); }

  /// Number of live parts of a type -- the quantity most decisions turn on.
  int countParts(std::string_view type) const;

  // --- actions ------------------------------------------------------------
  int attack(const GameObject& target) const {
    return handle_.call<int>("attack", target.handle());
  }
  int build(const ConstructionSite& target) const {
    return handle_.call<int>("build", target.handle());
  }
  int drop(std::string_view resource = RESOURCE_ENERGY) const {
    return handle_.call<int>("drop", std::string(resource));
  }
  int drop(std::string_view resource, int amount) const {
    return handle_.call<int>("drop", std::string(resource), amount);
  }
  int harvest(const Source& target) const {
    return handle_.call<int>("harvest", target.handle());
  }
  int heal(const Creep& target) const {
    return handle_.call<int>("heal", target.handle());
  }
  int move(int direction) const { return handle_.call<int>("move", direction); }
  int moveTo(Position target) const {
    return handle_.call<int>("moveTo", detail::toVal(target));
  }
  int pickup(const Resource& target) const {
    return handle_.call<int>("pickup", target.handle());
  }
  int pull(const Creep& target) const {
    return handle_.call<int>("pull", target.handle());
  }
  int rangedAttack(const GameObject& target) const {
    return handle_.call<int>("rangedAttack", target.handle());
  }
  int rangedHeal(const Creep& target) const {
    return handle_.call<int>("rangedHeal", target.handle());
  }
  int rangedMassAttack() const { return handle_.call<int>("rangedMassAttack"); }
  int transfer(const GameObject& target,
               std::string_view resource = RESOURCE_ENERGY) const {
    return handle_.call<int>("transfer", target.handle(), std::string(resource));
  }
  int transfer(const GameObject& target, std::string_view resource, int amount) const {
    return handle_.call<int>("transfer", target.handle(), std::string(resource), amount);
  }
  int withdraw(const Structure& target,
               std::string_view resource = RESOURCE_ENERGY) const {
    return handle_.call<int>("withdraw", target.handle(), std::string(resource));
  }
  int withdraw(const Structure& target, std::string_view resource, int amount) const {
    return handle_.call<int>("withdraw", target.handle(), std::string(resource), amount);
  }
};

/// Progress of a creep currently being spawned.
class Spawning {
 public:
  explicit Spawning(emscripten::val handle) : handle_(std::move(handle)) {}

  int needTime() const { return handle_["needTime"].as<int>(); }
  int remainingTime() const { return handle_["remainingTime"].as<int>(); }
  Creep creep() const { return Creep(handle_["creep"]); }

  int cancel() const {
    const emscripten::val result = handle_.call<emscripten::val>("cancel");
    return result.isUndefined() || result.isNull() ? OK : result.as<int>();
  }

  const emscripten::val& handle() const { return handle_; }

 private:
  emscripten::val handle_;
};

/// The result of `StructureSpawn::spawnCreep()`.
///
/// The JS API returns `{object?, error?}` rather than a bare code, so this
/// keeps both. `error` is absent on success.
struct SpawnCreepResult {
  std::optional<Creep> object;
  std::optional<int> error;

  /// True when the spawn accepted the request.
  explicit operator bool() const { return !error.has_value(); }
};

/// Creates creeps, and regenerates a little energy every tick.
class StructureSpawn : public OwnedStructure {
 public:
  static constexpr const char* kPrototype = "StructureSpawn";
  using OwnedStructure::OwnedStructure;

  Store store() const { return Store(handle_, slice_, index_); }

  /// Present only while a creep is being spawned.
  std::optional<Spawning> spawning() const {
    const emscripten::val value = handle_["spawning"];
    if (value.isUndefined() || value.isNull()) return std::nullopt;
    return Spawning(value);
  }

  std::vector<int> directions() const;
  int setDirections(const std::vector<int>& directions) const;

  SpawnCreepResult spawnCreep(const std::vector<std::string>& body) const;
};

/// Attacks or heals at range, from a fixed position.
class StructureTower : public OwnedStructure {
 public:
  static constexpr const char* kPrototype = "StructureTower";
  using OwnedStructure::OwnedStructure;

  Store store() const { return Store(handle_, slice_, index_); }
  int cooldown() const { return scalar(detail::Field::kCooldown, "cooldown"); }

  int attack(const GameObject& target) const {
    return handle_.call<int>("attack", target.handle());
  }
  int heal(const Creep& target) const {
    return handle_.call<int>("heal", target.handle());
  }
};

/// Stores resources. Walkable, and collects anything dropped on its tile.
class StructureContainer : public OwnedStructure {
 public:
  static constexpr const char* kPrototype = "StructureContainer";
  using OwnedStructure::OwnedStructure;

  Store store() const { return Store(handle_, slice_, index_); }
};

/// Holds energy that spawns may draw on.
class StructureExtension : public OwnedStructure {
 public:
  static constexpr const char* kPrototype = "StructureExtension";
  using OwnedStructure::OwnedStructure;

  Store store() const { return Store(handle_, slice_, index_); }
};

/// Blocks every creep.
class StructureWall : public Structure {
 public:
  static constexpr const char* kPrototype = "StructureWall";
  using Structure::Structure;
};

/// Blocks hostile creeps and shields whatever shares its tile.
class StructureRampart : public OwnedStructure {
 public:
  static constexpr const char* kPrototype = "StructureRampart";
  using OwnedStructure::OwnedStructure;
};

/// Cuts movement cost.
class StructureRoad : public Structure {
 public:
  static constexpr const char* kPrototype = "StructureRoad";
  using Structure::Structure;
};

}  // namespace arena

#endif  // __EMSCRIPTEN__
