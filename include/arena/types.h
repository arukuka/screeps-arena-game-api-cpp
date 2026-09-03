#pragma once

// Plain value types and the pure geometry helpers.
//
// Nothing here touches JavaScript, so this header compiles for the host as
// well as for WASM -- and `getRange` is computed in C++ rather
// than bridged, which makes it both free at runtime and testable natively.

#include <string>

#include "arena/constants.h"

namespace arena {

/// A position in the arena. Matches the JS `{x, y}` shape.
struct Position {
  int x = 0;
  int y = 0;

  friend bool operator==(const Position&, const Position&) = default;
};

/// Effect values are calculated as `base * (multiplier ?? 1) + (offset ?? 0)`.
struct EffectData {
  double multiplier = 1.0;
  double offset = 0.0;
};

/// An effect applied to a game object.
struct Effect {
  std::string effectType;
  EffectData data;
  /// The tick the effect expires. 0 when the game omitted it.
  int endTime = 0;
};

/// One entry of a creep's body.
struct BodyPart {
  std::string type;
  int hits = 0;
};

/// Linear (Chebyshev) range between two positions -- the number of squares.
///
/// Computed here rather than through `game/utils.getRange()`. The rule is
/// fixed and trivial, and a bot calls it far more often than anything else.
constexpr int getRange(Position a, Position b) {
  const int dx = a.x > b.x ? a.x - b.x : b.x - a.x;
  const int dy = a.y > b.y ? a.y - b.y : b.y - a.y;
  return dx > dy ? dx : dy;
}

// `getDirection` is deliberately *not* implemented here. Chebyshev range is a
// certainty; the rounding rule that maps an arbitrary delta onto the eight
// compass directions is not, and this library does not guess at game rules.
// It is bridged to the real implementation in <arena/utils.h>.

/// The position one step from `from` in `direction`.
constexpr Position step(Position from, int direction) {
  switch (direction) {
    case TOP: return {from.x, from.y - 1};
    case TOP_RIGHT: return {from.x + 1, from.y - 1};
    case RIGHT: return {from.x + 1, from.y};
    case BOTTOM_RIGHT: return {from.x + 1, from.y + 1};
    case BOTTOM: return {from.x, from.y + 1};
    case BOTTOM_LEFT: return {from.x - 1, from.y + 1};
    case LEFT: return {from.x - 1, from.y};
    case TOP_LEFT: return {from.x - 1, from.y - 1};
    default: return from;
  }
}

}  // namespace arena
