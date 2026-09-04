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

/// One prototype's objects for this tick.
struct Slice {
  /// The JS array. Kept whole rather than wrapped per element, so actions can
  /// still reach a handle without paying to materialise one per object.
  emscripten::val objects = emscripten::val::undefined();
  int count = 0;
  /// Id for `field()`, or -1 when there is no room to snapshot this slice and
  /// its objects must read through their handles.
  int id = -1;
};

/// The objects of one prototype, and a slice id to read them through. Cached
/// for the tick, so asking twice costs nothing the second time.
const Slice& objectsByPrototype(const std::string& prototype);

/// One object's value for one field.
///
/// Fields load a **column at a time, on first use**: asking any object for
/// `hits` fills `hits` for every object in the slice, in one crossing, and
/// every read after that is a memory access.
///
/// This is why the snapshot is not a fixed record. Reading a property off an
/// Arena game object costs ~150 ns even from JavaScript, so eagerly filling
/// fields the bot never asks for is money spent for nothing -- measured at 104
/// us a tick for 28 creeps when all 18 slots were filled, which was worse than
/// not snapshotting at all. Loading on demand means a bot pays for exactly the
/// fields it reads, and pays once however many times it reads them.
std::int32_t field(int slice, int index, Field which);

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
  /// @param owner  the object the store belongs to
  /// @param slice  its snapshot slice, or -1 to read through the handle
  /// @param index  its position within that slice
  Store(emscripten::val owner, int slice, int index)
      : owner_(std::move(owner)), slice_(slice), index_(index) {}

  /// Amount of `resource` held. 0 when the store has none.
  ///
  /// Energy comes from the snapshot; other resources still cross the boundary,
  /// because a fixed-width record cannot carry an open-ended set of them.
  int operator[](std::string_view resource) const {
    if (slice_ >= 0 && resource == RESOURCE_ENERGY) {
      const std::int32_t value = detail::field(slice_, index_, detail::Field::kStoreEnergy);
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
  std::optional<int> snapshotOr(detail::Field which, const char* method,
                                std::string_view resource) const {
    if (slice_ >= 0 && resource == RESOURCE_ENERGY) {
      const std::int32_t value = detail::field(slice_, index_, which);
      if (value != detail::kAbsent) return value;
    }
    return detail::optionalInt(handle().call<emscripten::val>(method, std::string(resource)));
  }

  emscripten::val owner_;
  int slice_ = -1;
  int index_ = 0;
};

/// Base prototype for game objects. Everything in the arena derives from this.
class GameObject {
 public:
  /// The name `getObjectsByPrototype()` passes to the JS side. Each subclass
  /// overrides it; the host maps the name back to the real prototype.
  static constexpr const char* kPrototype = "GameObject";

  /// @param handle  the JS game object
  /// @param slice   the snapshot slice, or -1 to read through the handle
  /// @param index   this object's position within that slice
  explicit GameObject(emscripten::val handle, int slice = -1, int index = 0)
      : handle_(std::move(handle)), slice_(slice), index_(index) {}

  const emscripten::val& handle() const { return handle_; }

  /// Snapshot slice, or -1 if this object was not snapshotted
  /// (`getObjectById()` and `getObjects()` return such objects). Reads then
  /// fall back to the handle, which is correct but far slower per field.
  int record() const { return slice_; }

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
  /// The snapshot value, or `kAbsent` when this object was not snapshotted.
  std::int32_t snapshot(detail::Field which) const {
    return slice_ >= 0 ? detail::field(slice_, index_, which) : detail::kAbsent;
  }

  /// A field the object always has: snapshot if available, handle otherwise.
  int scalar(detail::Field field, const char* property) const {
    const std::int32_t value = snapshot(field);
    return value != detail::kAbsent ? value : handle_[property].as<int>();
  }

  /// A field the object may not have at all.
  std::optional<int> optionalScalar(detail::Field which, const char* property) const {
    if (slice_ >= 0) {
      const std::int32_t value = detail::field(slice_, index_, which);
      return value == detail::kAbsent ? std::nullopt : std::optional<int>(value);
    }
    return detail::optionalInt(handle_[property]);
  }

  /// A tri-state flag: true, false, or "the game did not say".
  std::optional<bool> optionalFlag(detail::Field which, const char* property) const {
    if (slice_ >= 0) {
      const std::int32_t value = detail::field(slice_, index_, which);
      return value == detail::kAbsent ? std::nullopt : std::optional<bool>(value != 0);
    }
    const emscripten::val raw = handle_[property];
    if (raw.isUndefined() || raw.isNull()) return std::nullopt;
    return raw.as<bool>();
  }

  emscripten::val handle_;
  int slice_ = -1;
  int index_ = 0;
};

}  // namespace arena

#endif  // __EMSCRIPTEN__
