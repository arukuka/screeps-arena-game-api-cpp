#pragma once

// Test control for the fake `arena::` implementation in testing/fake.cc.
//
// A bot only ever sees `arena/utils.h`, so swapping the WASM bridge for this
// fake needs no seams in the bot itself: link `arena::testing` instead of
// `arena::api` and the same bot sources build and run natively -- no
// Emscripten, no Node, no WASM.

namespace arena::testing {

/// Sets what the next `arena::getTicks()` returns.
void setTicks(int ticks);

/// How many times the bot has called `arena::getTicks()` since the last reset.
///
/// The Arena bills wall-clock CPU per tick and every API call crosses the
/// JS boundary, so this doubles as a budget check in unit tests.
int getTicksCallCount();

/// Restores every fake to its initial state.
void reset();

}  // namespace arena::testing
