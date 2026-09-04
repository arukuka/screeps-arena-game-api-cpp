#pragma once

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// The base of the game object model.
//
// Every game object is a thin wrapper around the JavaScript object the Arena
// handed us. Reading a property crosses the JS boundary, so a property in the
// JS API is a *method* here: `creep.hits()`, not `creep.hits`. That difference
// is the one deliberate deviation from "the Arena docs are the docs for this
// header too" -- it exists so the cost of a read is visible at the call site.
//
// The Arena bills wall-clock CPU per tick, so a hot loop that reads the same
// property repeatedly should hoist it into a local.

#ifdef __EMSCRIPTEN__

#include <emscripten/val.h>

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "arena/types.h"

namespace arena {

namespace detail {

/// The host table injected as `Module.arena` (see js/host.mjs), fetched once.
const emscripten::val& api();

// --- the per-tick snapshot -------------------------------------------------
//
// Reading a property off a handle costs ~500 ns on the real game, about 70% of
// which is the boundary crossing itself (see bench/README.md). So the numeric
// fields are copied into WASM memory in one crossing per prototype, at the
// point `getObjectsByPrototype()` is called, and read from there afterwards at
// ~0.24 ns.
//
// Actions still go through the handle, immediately, because they are rare --
// once or twice per creep per tick -- and because batching them would mean
// giving up the result code, which is the thing every Screeps bot branches on.
//
// Anything not in this list stays on the handle: strings (`id`,
// `resourceType`), arrays (`body`, `effects`), and nested objects. Those are
// either cold or not expressible as an int32.

enum class Field : int {
  kX = 0,
  kY,
  kExists,
  kTicksToDecay,
  kHits,
  kHitsMax,
  kMy,
  kFatigue,
  kSpawning,
  kEnergy,
  kEnergyCapacity,
  kAmount,
  kProgress,
  kProgressTotal,
  kCooldown,
  kStoreEnergy,
  kStoreCapacity,
  kStoreUsed,
  kCount,
};

inline constexpr int kFieldCount = static_cast<int>(Field::kCount);

/// Written where the game object has no such property. Distinguishes "absent"
/// from a legitimate 0, which matters for `my` and for optional hit points.
inline constexpr std::int32_t kAbsent = INT32_MIN;

/// Discards the snapshot. Called once per tick from `src/entry.cc`, before the
/// bot runs, so a bot cannot accidentally read last tick's world.
void beginTick();

/// Raw slot value. `record` must be a valid index.
std::int32_t snapshotValue(int record, Field field);

/// One prototype's objects, snapshotted and ready to wrap.
struct Slice {
  /// The JS array. Kept whole rather than wrapped per element, so actions can
  /// still reach a handle without paying to materialise one per object.
  emscripten::val objects = emscripten::val::undefined();
  /// Index of the first record, or -1 when the snapshot could not be taken and
  /// the objects must fall back to reading through their handles.
  int base = -1;
  int count = 0;
};

/// Snapshots one prototype, or returns the cached slice if already done this
/// tick. One crossing regardless of how many fields each object has.
const Slice& snapshotByPrototype(const std::string& prototype);

/// `{x, y}` as a JS object, for the API calls that take a bare position.
emscripten::val toVal(Position position);

/// Reads an optional number, treating JS `undefined`/`null` as absent.
std::optional<int> optionalInt(const emscripten::val& value);

/// Wraps each element of a JS array in `T`.
template <typename T>
std::vector<T> toVector(const emscripten::val& array) {
  if (array.isNull() || array.isUndefined()) return {};

  const unsigned length = array["length"].as<unsigned>();
  std::vector<T> objects;
  objects.reserve(length);
  for (unsigned index = 0; index < length; ++index) {
    objects.emplace_back(array[index]);
  }
  return objects;
}

/// Builds a JS array of handles from any range of game objects or positions.
template <typename T>
emscripten::val toValArray(const std::vector<T>& items) {
  emscripten::val array = emscripten::val::array();
  for (std::size_t index = 0; index < items.size(); ++index) {
    if constexpr (std::is_same_v<T, Position>) {
      array.set(index, toVal(items[index]));
    } else {
      array.set(index, items[index].handle());
    }
  }
  return array;
}

}  // namespace detail

/// A `Store` on a creep or structure.
class Store {
 public:
  /// @param owner   the object the store belongs to
  /// @param record  its snapshot record, or -1 to read through the handle
  Store(emscripten::val owner, int record)
      : owner_(std::move(owner)), record_(record) {}

  /// Amount of `resource` held. 0 when the store has none.
  ///
  /// Energy comes from the snapshot; other resources still cross the boundary,
  /// because a fixed-width record cannot carry an open-ended set of them.
  int operator[](std::string_view resource) const {
    if (record_ >= 0 && resource == RESOURCE_ENERGY) {
      const std::int32_t value = detail::snapshotValue(record_, detail::Field::kStoreEnergy);
      if (value != detail::kAbsent) return value;
    }
    const emscripten::val amount = handle()[std::string(resource)];
    return amount.isUndefined() || amount.isNull() ? 0 : amount.as<int>();
  }

  /// Shorthand for the resource every arena has.
  int energy() const { return (*this)[RESOURCE_ENERGY]; }

  std::optional<int> getCapacity(std::string_view resource = RESOURCE_ENERGY) const {
    return snapshotOr(detail::Field::kStoreCapacity, "getCapacity", resource);
  }
  std::optional<int> getUsedCapacity(std::string_view resource = RESOURCE_ENERGY) const {
    return snapshotOr(detail::Field::kStoreUsed, "getUsedCapacity", resource);
  }
  std::optional<int> getFreeCapacity(std::string_view resource = RESOURCE_ENERGY) const {
    const std::optional<int> capacity = getCapacity(resource);
    const std::optional<int> used = getUsedCapacity(resource);
    if (capacity.has_value() && used.has_value()) return *capacity - *used;
    return detail::optionalInt(
        handle().call<emscripten::val>("getFreeCapacity", std::string(resource)));
  }

  /// The underlying JS store. Fetched on demand: a bot that only reads energy
  /// never pays for it.
  emscripten::val handle() const { return owner_["store"]; }

 private:
  std::optional<int> snapshotOr(detail::Field field, const char* method,
                                std::string_view resource) const {
    if (record_ >= 0 && resource == RESOURCE_ENERGY) {
      const std::int32_t value = detail::snapshotValue(record_, field);
      if (value != detail::kAbsent) return value;
    }
    return detail::optionalInt(handle().call<emscripten::val>(method, std::string(resource)));
  }

  emscripten::val owner_;
  int record_ = -1;
};

/// Base prototype for game objects. Everything in the arena derives from this.
class GameObject {
 public:
  /// The name `getObjectsByPrototype()` passes to the JS side. Each subclass
  /// overrides it; the host maps the name back to the real prototype.
  static constexpr const char* kPrototype = "GameObject";

  /// @param handle  the JS game object
  /// @param record  its snapshot record, or -1 to read through the handle
  explicit GameObject(emscripten::val handle, int record = -1)
      : handle_(std::move(handle)), record_(record) {}

  const emscripten::val& handle() const { return handle_; }

  /// Index into this tick's snapshot, or -1 if this object was not snapshotted
  /// (`getObjectById()` and `getObjects()` return such objects). Reads then
  /// fall back to the handle, which is correct but ~2000x slower per field.
  int record() const { return record_; }

  /// True while the object is still in the game.
  bool exists() const {
    const std::int32_t value = snapshot(detail::Field::kExists);
    return value != detail::kAbsent ? value != 0 : handle_["exists"].as<bool>();
  }

  /// The id `getObjectById()` takes. Numeric ids are stringified.
  std::string id() const { return handle_["id"].as<std::string>(); }

  int x() const { return scalar(detail::Field::kX, "x"); }
  int y() const { return scalar(detail::Field::kY, "y"); }

  Position pos() const { return {x(), y()}; }

  /// Implicit so that anything taking a `Position` also takes an object.
  operator Position() const { return pos(); }  // NOLINT(google-explicit-constructor)

  /// Ticks until the object decays, when it decays at all.
  std::optional<int> ticksToDecay() const {
    return optionalScalar(detail::Field::kTicksToDecay, "ticksToDecay");
  }

  /// Effects currently applied to this object.
  std::vector<Effect> effects() const;

  int getRangeTo(Position target) const { return getRange(pos(), target); }

 protected:
  /// The snapshot slot, or `kAbsent` when this object was not snapshotted.
  std::int32_t snapshot(detail::Field field) const {
    return record_ >= 0 ? detail::snapshotValue(record_, field) : detail::kAbsent;
  }

  /// A field the object always has: snapshot if available, handle otherwise.
  int scalar(detail::Field field, const char* property) const {
    const std::int32_t value = snapshot(field);
    return value != detail::kAbsent ? value : handle_[property].as<int>();
  }

  /// A field the object may not have at all.
  std::optional<int> optionalScalar(detail::Field field, const char* property) const {
    if (record_ >= 0) {
      const std::int32_t value = detail::snapshotValue(record_, field);
      return value == detail::kAbsent ? std::nullopt : std::optional<int>(value);
    }
    return detail::optionalInt(handle_[property]);
  }

  /// A tri-state flag: true, false, or "the game did not say".
  std::optional<bool> optionalFlag(detail::Field field, const char* property) const {
    if (record_ >= 0) {
      const std::int32_t value = detail::snapshotValue(record_, field);
      return value == detail::kAbsent ? std::nullopt : std::optional<bool>(value != 0);
    }
    const emscripten::val raw = handle_[property];
    if (raw.isUndefined() || raw.isNull()) return std::nullopt;
    return raw.as<bool>();
  }

  emscripten::val handle_;
  int record_ = -1;
};

}  // namespace arena

#endif  // __EMSCRIPTEN__
