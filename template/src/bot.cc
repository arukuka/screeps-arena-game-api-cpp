// Your bot.
//
// `arena::loop()` is the one function the library requires you to define; it is
// called once per tick. Everything you can ask the game is declared in
// <arena/utils.h>.

#include <cstdio>

#include <arena/bot.h>
#include <arena/utils.h>

namespace {

// The WASM heap lives for the whole match, so state kept here survives between
// ticks. Not having to rebuild it every tick is the main reason to write a bot
// in C++ at all.
int g_loopCount = 0;

}  // namespace

namespace arena {

void loop() {
  const int tick = getTicks();
  ++g_loopCount;

  // printf and std::cout reach the Arena console.
  std::printf("hello from C++: tick %d (loop #%d)\n", tick, g_loopCount);
}

}  // namespace arena
