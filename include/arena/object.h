#pragma once

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

#include <optional>
#include <string>
#include <vector>

#include "arena/types.h"

namespace arena {

namespace detail {

/// The host table injected as `Module.arena` (see js/host.mjs), fetched once.
const emscripten::val& api();

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
  explicit Store(emscripten::val handle) : handle_(std::move(handle)) {}

  /// Amount of `resource` held. 0 when the store has none.
  int operator[](std::string_view resource) const {
    const emscripten::val amount = handle_[std::string(resource)];
    return amount.isUndefined() || amount.isNull() ? 0 : amount.as<int>();
  }

  /// Shorthand for the resource every arena has.
  int energy() const { return (*this)[RESOURCE_ENERGY]; }

  std::optional<int> getCapacity(std::string_view resource = RESOURCE_ENERGY) const {
    return detail::optionalInt(handle_.call<emscripten::val>("getCapacity", std::string(resource)));
  }
  std::optional<int> getUsedCapacity(std::string_view resource = RESOURCE_ENERGY) const {
    return detail::optionalInt(handle_.call<emscripten::val>("getUsedCapacity", std::string(resource)));
  }
  std::optional<int> getFreeCapacity(std::string_view resource = RESOURCE_ENERGY) const {
    return detail::optionalInt(handle_.call<emscripten::val>("getFreeCapacity", std::string(resource)));
  }

  const emscripten::val& handle() const { return handle_; }

 private:
  emscripten::val handle_;
};

/// Base prototype for game objects. Everything in the arena derives from this.
class GameObject {
 public:
  /// The name `getObjectsByPrototype()` passes to the JS side. Each subclass
  /// overrides it; the host maps the name back to the real prototype.
  static constexpr const char* kPrototype = "GameObject";

  explicit GameObject(emscripten::val handle) : handle_(std::move(handle)) {}

  const emscripten::val& handle() const { return handle_; }

  /// True while the object is still in the game.
  bool exists() const { return handle_["exists"].as<bool>(); }

  /// The id `getObjectById()` takes. Numeric ids are stringified.
  std::string id() const { return handle_["id"].as<std::string>(); }

  int x() const { return handle_["x"].as<int>(); }
  int y() const { return handle_["y"].as<int>(); }

  Position pos() const { return {x(), y()}; }

  /// Implicit so that anything taking a `Position` also takes an object.
  operator Position() const { return pos(); }  // NOLINT(google-explicit-constructor)

  /// Ticks until the object decays, when it decays at all.
  std::optional<int> ticksToDecay() const {
    return detail::optionalInt(handle_["ticksToDecay"]);
  }

  /// Effects currently applied to this object.
  std::vector<Effect> effects() const;

  int getRangeTo(Position target) const { return getRange(pos(), target); }

 protected:
  emscripten::val handle_;
};

}  // namespace arena

#endif  // __EMSCRIPTEN__
