#pragma once

// Test control for the fake `arena::` implementation in arena_fake.cc.
//
// The bot only ever sees `cpp/arena/utils.h`, so swapping the WASM bridge for
// this fake needs no seams in the bot itself: the native test binary just links
// a different translation unit.

namespace arena::testing {

/// Sets what the next `arena::getTicks()` returns.
void setTicks(int ticks);

/// Restores every fake to its initial state.
void reset();

}  // namespace arena::testing
