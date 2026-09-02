#include "arena/testing/fake.h"

#include "arena/utils.h"

namespace {
int g_ticks = 1;
int g_getTicksCalls = 0;
}  // namespace

namespace arena {

int getTicks() {
  ++g_getTicksCalls;
  return g_ticks;
}

}  // namespace arena

namespace arena::testing {

void setTicks(int ticks) { g_ticks = ticks; }

int getTicksCallCount() { return g_getTicksCalls; }

void reset() {
  g_ticks = 1;
  g_getTicksCalls = 0;
}

}  // namespace arena::testing
