#include "fixtures/probe_bot.h"

#include <cstdio>

#include "arena/bot.h"
#include "arena/utils.h"

namespace {

// Persistent across ticks -- this lives in the WASM heap for the whole match,
// which is what the JS tests assert on.
int g_loopCount = 0;
int g_lastTick = 0;

}  // namespace

namespace arena {

void loop() {
  const int tick = getTicks();
  ++g_loopCount;

  // `g_lastTick` is still the previous call's tick here, and is 0 before the
  // first call. Printing it is what proves the heap survived between ticks.
  // Routed to the Arena console by js/runtime.mjs.
  std::printf("tick %d (loop #%d, previous %d)\n", tick, g_loopCount,
              g_lastTick);

  g_lastTick = tick;
}

}  // namespace arena

namespace probe {

int lastTick() { return g_lastTick; }

int loopCount() { return g_loopCount; }

void reset() {
  g_loopCount = 0;
  g_lastTick = 0;
}

}  // namespace probe
