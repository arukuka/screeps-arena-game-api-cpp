#pragma once

// Mirror of the Screeps: Arena `game/utils` module -- the API a bot calls.
//
// Every function here is declared once and implemented twice:
//
//   * `src/utils_wasm.cc` -- the real bridge (target `arena::api`), which
//     calls the JS host table through EM_JS.
//   * `testing/fake.cc` -- an in-process fake (target `arena::testing`), so a
//     bot can be unit-tested natively without Emscripten or Node.
//
// Keep the names identical to the JS API (`getTicks`, not `get_ticks`) so that
// the Arena docs read as documentation for this header too.

namespace arena {

/// `game/utils.getTicks()` — number of ticks passed since the start of the game.
/// The first tick the bot runs on is 1.
int getTicks();

}  // namespace arena
