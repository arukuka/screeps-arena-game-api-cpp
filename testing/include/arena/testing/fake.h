#pragma once

// Test control for the fake `arena::` implementation in testing/fake.cc.
//
// Scope: the scalar half of `game/utils` -- the part that carries no JavaScript
// values and so is declared for host builds too.
//
// The object model (`getObjectsByPrototype`, `Creep`, ...) is built on
// `emscripten::val`, which has no host equivalent, so it exists only in the
// WASM build and is covered by the simulator instead. Split your bot so the
// decisions live in functions that take plain data, and those functions stay
// testable here.

#include "arena/types.h"

namespace arena::testing {

/// Sets what `arena::getTicks()` returns.
void setTicks(int ticks);

/// How many times the bot has called `arena::getTicks()` since the last reset.
///
/// The Arena bills wall-clock CPU per tick and every API call crosses the
/// JS boundary, so this doubles as a budget check in unit tests.
int getTicksCallCount();

/// Sets what `arena::getCpuTime()` returns, in nanoseconds.
void setCpuTime(double nanoseconds);

/// Sets what `arena::getTerrainAt()` returns for one position.
/// Positions never set report TERRAIN_PLAIN.
void setTerrainAt(Position position, int terrain);

/// Sets what `arena::getDirection()` returns for one delta.
/// Deltas never set report 0.
void setDirection(int dx, int dy, int direction);

/// Restores every fake to its initial state.
void reset();

}  // namespace arena::testing
