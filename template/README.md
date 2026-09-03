# my-arena-bot

**English** | [日本語](README.ja.md)

A template for writing Screeps: Arena bots in C++, built on
[screeps-arena-game-api-cpp](https://github.com/arukuka/screeps-arena-game-api-cpp).

## Setup

```sh
npm install
npm run setup      # installs Emscripten into third_party/emsdk (once, a few minutes)
```

Skip `npm run setup` if your shell already has `EMSDK` set.

Requires Node 22+, CMake 3.25+, and Ninja (`brew install cmake ninja` on macOS).

### Editors (clangd)

Running `npm run build` once generates `.clangd`, after which completion and
go-to-definition work.

It is generated, so it is gitignored. Writing your own `.clangd` takes
precedence and suppresses generation. How it works is documented in
`node_modules/screeps-arena-game-api-cpp/cmake/ClangdConfig.cmake`.

## Writing the bot

`arena::loop()` in `src/bot.cc` is called once per tick.

```cpp
#include <arena/arena.h>

namespace arena {
void loop() {
  for (const Creep& creep : getObjectsByPrototype<Creep>()) {
    if (!creep.my()) continue;
    if (creep.harvest(source) == ERR_NOT_IN_RANGE) creep.moveTo(source.pos());
  }
}
}  // namespace arena
```

A JS **property is a method here** (`creep.hits()`). Every read crosses the JS
boundary, and the method call makes that cost visible at the call site.

**The WASM heap survives the whole match.** State in globals or function statics
persists across ticks. Not having to rebuild it every tick is the reason to
write a bot in C++ at all.

### Why src/ is split in two

| File | Role | Native tests |
|---|---|---|
| `src/strategy.cc` | decisions over plain data | ✅ one second |
| `src/bot.cc` | reads the game, calls strategy, acts | ❌ |

Game objects are `emscripten::val` handles, and there is no host equivalent, so
code that reads a `Creep` only runs under WASM and cannot be tested natively.

**The more of the thinking that lives in `strategy.cc`, the more you can test in
the fast loop.** Keep `bot.cc` thin.

## Running

```sh
npm run sim                   # run the arena's full tick limit
npm run sim -- --ticks 5      # just 5 ticks
npm test                      # native C++ tests + the simulator
```

## Deploying

```sh
ARENA_DIR=~/ScreepsArena/season4-pain_and_gain npm run deploy
```

That copies `dist/main.mjs`, a single file with the WASM embedded as base64.

## Two layers of tests

| | Covers | Speed | Needs |
|---|---|---|---|
| `tests/bot_test.cc` | the decisions in `strategy.cc` | ~1 second | nothing (native) |
| `tests/sim.test.mjs` | compiled WASM against the simulator | ~0.1 second | a built WASM |

The native tests link `arena::testing`, which fakes the part of `game/utils`
that **carries no JavaScript values** (`getTicks` and friends).
`src/strategy.cc` never touches a game object, so it tests entirely here.

`arena::testing::getTicksCallCount()` also lets you assert on how many API calls
you made. The Arena bills wall-clock CPU per tick and every API call crosses the
JS boundary, so putting a ceiling on that count is worth doing.

`src/bot.cc` reads game objects and therefore does not run natively;
`tests/sim.test.mjs` covers it against the compiled WASM instead.

## Layout

```
src/strategy.cc       decisions (what the native tests cover)
src/bot.cc            the connection to the game
js/main.mjs           the Arena entry point (rarely needs touching)
sim/run.mjs           CLI for running locally
tests/                native unit tests and simulator tests
CMakeLists.txt        just calls arena_add_bot()
```

The simulator's engine is an **approximation**. What is measured, what is
assumed, and what is missing are all in
`node_modules/screeps-arena-game-api-cpp/sim/FIDELITY.md`. Read it before tuning
details.

Library documentation
([screeps-arena-game-api-cpp](https://github.com/arukuka/screeps-arena-game-api-cpp)):

- [docs/ARENA-RUNTIME.md](https://github.com/arukuka/screeps-arena-game-api-cpp/blob/main/docs/ARENA-RUNTIME.md)
  — the Arena sandbox's quirks, why each build flag is set, and **how to read a
  startup failure**
- [docs/DESIGN.md](https://github.com/arukuka/screeps-arena-game-api-cpp/blob/main/docs/DESIGN.md)
  — the constants policy, the choice of object representation
- [docs/CONTRIBUTING.md](https://github.com/arukuka/screeps-arena-game-api-cpp/blob/main/docs/CONTRIBUTING.md)
  — how to add an API
