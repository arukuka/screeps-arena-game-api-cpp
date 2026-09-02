#include <cassert>
#include <cstdio>

#include <arena/bot.h>
#include <arena/testing/fake.h>

namespace {

void readsTheCurrentTick() {
  arena::testing::reset();
  arena::testing::setTicks(42);

  arena::loop();

  assert(arena::testing::getTicksCallCount() == 1);
}

// The Arena bills wall-clock CPU per tick and every API call crosses the JS
// boundary, so the call count is worth holding a line on as the bot grows.
void staysWithinItsApiBudget() {
  arena::testing::reset();

  for (int tick = 1; tick <= 10; ++tick) {
    arena::testing::setTicks(tick);
    arena::loop();
  }

  assert(arena::testing::getTicksCallCount() == 10);
}

}  // namespace

int main() {
  readsTheCurrentTick();
  staysWithinItsApiBudget();

  std::puts("all bot tests passed");
  return 0;
}
