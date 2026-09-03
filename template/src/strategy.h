#pragma once

// Decisions, expressed over plain data.
//
// Nothing here touches the game, which is the whole point: `emscripten::val`
// has no host equivalent, so anything that reads a `Creep` can only run in
// WASM. Keep the thinking in functions like these and it stays testable
// natively, in about a second, with no Emscripten and no Node.
//
// `src/bot.cc` is then a thin layer that reads the game, calls in here, and
// issues the actions.

#include <optional>
#include <vector>

#include <arena/types.h>

namespace strategy {

/// The candidate closest to `from` by linear range, or nothing when empty.
/// Ties go to the earlier candidate, so the choice is stable across ticks.
std::optional<arena::Position> closest(arena::Position from,
                                       const std::vector<arena::Position>& candidates);

}  // namespace strategy
