#include "bot/bot.h"

#include <cstdio>

#include "arena/utils.h"

namespace bot {
namespace {

// Persistent across ticks — this lives in the WASM heap for the whole match.
int g_loopCount = 0;
int g_previousTick = 0;

}  // namespace

int loop() {
  const int tick = arena::getTicks();
  ++g_loopCount;

  // `printf` is routed to the Arena console by js/runtime.mjs.
  std::printf("tick %d (loop #%d, previous %d)\n", tick, g_loopCount,
              g_previousTick);

  g_previousTick = tick;
  return tick;
}

int loopCount() { return g_loopCount; }

void reset() {
  g_loopCount = 0;
  g_previousTick = 0;
}

}  // namespace bot
