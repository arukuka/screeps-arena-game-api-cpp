#include "strategy.h"

#include <arena/types.h>

namespace strategy {

std::optional<arena::Position> closest(arena::Position from,
                                       const std::vector<arena::Position>& candidates) {
  std::optional<arena::Position> best;
  int bestRange = 0;

  for (const arena::Position& candidate : candidates) {
    const int distance = arena::getRange(from, candidate);
    if (!best.has_value() || distance < bestRange) {
      best = candidate;
      bestRange = distance;
    }
  }
  return best;
}

}  // namespace strategy
