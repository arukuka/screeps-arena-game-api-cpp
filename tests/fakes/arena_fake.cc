#include "fakes/arena_fake.h"

#include "arena/utils.h"

namespace {
int g_ticks = 1;
}  // namespace

namespace arena {

int getTicks() { return g_ticks; }

}  // namespace arena

namespace arena::testing {

void setTicks(int ticks) { g_ticks = ticks; }

void reset() { g_ticks = 1; }

}  // namespace arena::testing
