#include <cassert>
#include <cstdio>
#include <vector>

#include <arena/testing/fake.h>
#include <arena/types.h>
#include <arena/utils.h>

#include "strategy.h"

namespace {

void picksTheNearestCandidate() {
  const std::vector<arena::Position> sources = {{10, 10}, {3, 4}, {20, 1}};

  const auto chosen = strategy::closest({2, 2}, sources);

  assert(chosen.has_value());
  assert((*chosen == arena::Position{3, 4}));
}

void hasNoAnswerWithoutCandidates() {
  assert(!strategy::closest({0, 0}, {}).has_value());
}

void breaksTiesTowardTheFirstCandidate() {
  // Stability matters: a creep that flips between equidistant targets every
  // tick never arrives at either.
  const std::vector<arena::Position> tied = {{5, 0}, {0, 5}};

  assert((*strategy::closest({0, 0}, tied) == arena::Position{5, 0}));
}

// The scalar half of the API is faked, so logic that reads the clock is
// testable here too.
void readsTheCurrentTick() {
  arena::testing::reset();
  arena::testing::setTicks(42);

  assert(arena::getTicks() == 42);
  assert(arena::testing::getTicksCallCount() == 1);
}

}  // namespace

int main() {
  picksTheNearestCandidate();
  hasNoAnswerWithoutCandidates();
  breaksTiesTowardTheFirstCandidate();
  readsTheCurrentTick();

  std::puts("all bot tests passed");
  return 0;
}
