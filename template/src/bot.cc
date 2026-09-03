// Your bot.
//
// `arena::loop()` is the one function the library requires you to define; it is
// called once per tick. Everything you can ask the game is in <arena/arena.h>.
//
// This file is deliberately thin: it reads the game, hands plain data to
// `strategy.h`, and issues the actions. The decisions stay in strategy.cc,
// which unit-tests natively -- see tests/.

#include <cstdio>
#include <vector>

#include <arena/arena.h>

#include "strategy.h"

namespace {

// The WASM heap lives for the whole match, so state kept here survives between
// ticks. Not having to rebuild it every tick is the main reason to write a bot
// in C++ at all.
int g_harvested = 0;

}  // namespace

namespace arena {

void loop() {
  const int tick = getTicks();

  // Reading a property crosses into JavaScript, so it is a method call here --
  // and worth hoisting out of a loop once it gets hot.
  const std::vector<Creep> creeps = getObjectsByPrototype<Creep>();
  const std::vector<Source> sources = getObjectsByPrototype<Source>();

  std::vector<Position> sourcePositions;
  sourcePositions.reserve(sources.size());
  for (const Source& source : sources) sourcePositions.push_back(source.pos());

  for (const Creep& creep : creeps) {
    if (!creep.my() || creep.spawning()) continue;

    const std::optional<Position> target = strategy::closest(creep.pos(), sourcePositions);
    if (!target.has_value()) break;

    // Actions return the game's own result code, so the usual Screeps shape
    // works unchanged.
    if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
      creep.moveTo(*target);
    } else {
      ++g_harvested;
    }
  }

  // printf and std::cout reach the Arena console.
  std::printf("tick %d: %zu creeps, %d harvests so far\n", tick, creeps.size(),
              g_harvested);
}

}  // namespace arena
