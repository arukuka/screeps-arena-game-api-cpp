# screeps-arena-game-api-cpp

**English** | [日本語](README.ja.md)

[![CI](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml/badge.svg)](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml)

Write Screeps: Arena bots in **C++, compiled to WebAssembly**. Comes with a
local simulator and a CMake helper, so you never have to learn Emscripten.

> **Verification is still in progress.** The bridge works on the real game; the
> full API has not yet been signed off arena by arena. See below.

---

## Verification status

The bridge itself is confirmed against the real game. A bot deployed to Pain and
Gain ran the **full 2000 ticks**:

```
tick 1 (loop #1, previous 0)
tick 2 (loop #2, previous 1)
...
tick 2000 (loop #2000, previous 1999)
```

`previous` holding the value from the tick before is the real game confirming
that the WASM heap survives the whole match, and probes established that
WebAssembly is available and that a 16 MB heap can be reserved.

That bot, however, called only `getTicks()`. The rest of the API --
`getObjectsByPrototype()`, creep and structure actions, the path finder, visuals
-- has so far only been exercised against the simulator, which is
[an approximation](sim/FIDELITY.md), not the real engine. So each arena is still
being checked:

- [ ] Pain and Gain: Basic level
- [ ] Spawn and Swamp: Basic level
- [ ] Escort Run: Basic level
- [ ] Pain and Gain: Advanced level
- [ ] Spawn and Swamp: Advanced level
- [ ] Escort Run: Advanced level

Until a box is ticked, treat behaviour on that arena as untested rather than
working. If something turns out to differ, `sim/FIDELITY.md` is where the
correction belongs.

---

## Quick start

Copying [`template/`](template/) is the fastest way in.

```sh
cp -r template my-bot && cd my-bot
npm install
npm run setup      # installs Emscripten 6.0.9 into third_party/emsdk (once, a few minutes)
npm test           # native C++ unit tests + the simulator
npm run sim -- --ticks 5
```

All you write is `arena::loop()` -- one function, called once per tick.

```cpp
#include <arena/arena.h>

namespace arena {
void loop() {
  const std::vector<Source> sources = getObjectsByPrototype<Source>();

  for (const Creep& creep : getObjectsByPrototype<Creep>()) {
    if (!creep.my() || sources.empty()) continue;

    // Actions return the game's own result code, so the shape every Screeps
    // player already knows works unchanged.
    if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
      creep.moveTo(sources[0].pos());
    }
  }
}
}  // namespace arena
```

The template keeps its decisions in `src/strategy.cc`. That file never touches
a game object, so it **unit-tests natively in about a second** -- see
"What native tests can and cannot see" below for why that split exists.

Deploy:

```sh
ARENA_DIR=~/ScreepsArena/season4-pain_and_gain npm run deploy
```

Requires Node 22+, CMake 3.25+, and Ninja (`brew install cmake ninja` on macOS).

---

## What you get

### C++

| Header | Contents |
|---|---|
| `<arena/bot.h>` | **Declares** `arena::loop()` and nothing else. You implement it; forgetting is a link error |
| `<arena/utils.h>` | Mirror of `game/utils`, e.g. `getObjectsByPrototype<Creep>()` |
| `<arena/prototypes.h>` | `Creep`, `StructureSpawn`, `StructureTower` and every other prototype |
| `<arena/constants.h>` | Every `game/constants` value, plus the ones measured in real matches |
| `<arena/types.h>` | `Position`, `getRange()` and friends. **Touches no JavaScript, so it works natively too** |
| `<arena/path_finder.h>` | `searchPath()`, `CostMatrix` |
| `<arena/visual.h>` | `Visual` |
| `<arena/arena.h>` | All of the above |
| `<arena/testing/fake.h>` | Fakes for native unit tests |

| CMake target | Purpose |
|---|---|
| `arena_add_bot(<target> SOURCES ...)` | Produces the `.mjs`. **Every link flag lives in here** |
| `arena::api` | The real bridge (WASM build) |
| `arena::testing` | The same API backed by fakes (native build) |

### JavaScript

| Import | Contents |
|---|---|
| `screeps-arena-game-api-cpp/arena` | `createArenaEntry()` -- the Arena entry point. Imports `game/*`, so it **only loads inside the real game** |
| `screeps-arena-game-api-cpp/sim` | `createMatch()`, `World` -- running locally |
| `screeps-arena-game-api-cpp/rollup` | `arenaBundle()` -- the rollup config |
| `screeps-arena-game-api-cpp` | `createHost()`, `createBot()` -- the low-level pieces |

This is the whole of the JavaScript you write:

```js
// js/main.mjs
import { createArenaEntry } from 'screeps-arena-game-api-cpp/arena';
import createArenaBot from '../dist/wasm/bot.mjs';

export const loop = createArenaEntry(createArenaBot);
```

Constants are **never guessed at**. Anything the typings declare without a
value and nobody has measured -- `OBSTACLE_OBJECT_TYPES`, for instance -- is
deliberately absent from `constants.h`; read it from the running game with
`arena::obstacleObjectTypes()` instead. The reasoning is in
[docs/DESIGN.md](docs/DESIGN.md).

---

## Architecture

```
                  ┌────────────────────────── Arena runtime ──────┐
  every tick      │  import { loop } from 'main.mjs'              │
  ─────────────►  │  loop()                                       │
                  └───────────────┬───────────────────────────────┘
                                  │
                    js/arena.mjs  │  imports game/utils, builds the host table
                                  ▼
                     js/host.mjs  ├── createHost({ utils })  ◄── the only seam
                                  │
                  js/runtime.mjs  │  instantiates the WASM synchronously
                                  ▼
                       ┌──────────────────── WASM ─────────────────┐
                       │  arena_loop()        src/entry.cc         │
                       │      └─ arena::loop()   your code         │
                       │            └─ arena::getTicks()           │
                       │                     src/bridge.cc         │
                       │                     val ──────────────────┼──► Module.arena.getTicks()
                       └───────────────────────────────────────────┘
```

**The host table in `js/host.mjs` is the only seam**, and that is the point of
the design. Production (`js/arena.mjs`) passes the real `game/*`; the simulator
(`sim/harness.mjs`) passes `sim/game/*`. Both go through the same
`createHost()`, so the simulator cannot drift from production by wiring
something up differently.

The C++ side has the same shape: one set of declarations in
`include/arena/utils.h`, two implementations.

- `src/bridge.cc` -- the real bridge, through `emscripten::val` (`arena::api`)
- `testing/fake.cc` -- fakes for native unit tests (`arena::testing`)

### Reads come from a snapshot, actions go to the handle

A game object holds a JS handle *and* an index into a per-tick snapshot.
Reading a property is served from WASM memory; acting still crosses into
JavaScript immediately, so actions still return the game's result code.

The signatures are identical either way, so your bot never learns which is
which:

```cpp
if (!creep.my()) continue;                        // snapshot, ~1 ns
if (creep.harvest(src) == ERR_NOT_IN_RANGE) {     // crossing, result code intact
  creep.moveTo(src.pos());
}
```

**Columns load lazily.** Asking any creep for `hits` fills `hits` for every
creep in that slice, in one crossing; every read after that is a memory access.
Nothing is fetched until something asks for it.

The reason is one measurement: reading a property off an Arena game object costs
roughly the same whether you do it from C++ (~400 ns, crossing included) or from
JavaScript (~230 ns). The boundary is not the expensive part -- **the count of
property reads is**. So the design goal is to read each field at most once per
tick, and to read no field nobody asked for.

That also rules out the alternatives, all of which were tried and measured:
filling a fixed record eagerly was worse than not snapshotting at all, and
specialising the loop per field was 1.4x worse than sharing one.
[bench/README.md](bench/README.md) has the numbers and the failed attempts.

### Actions are not batched, deliberately

Batching them would remove the last crossing per creep, and cost the result
code. `if (creep.harvest(s) == ERR_NOT_IN_RANGE)` is the shape every Screeps bot
is written in, and an action that answers next tick cannot support it.

The measurements said that trade was unnecessary: reads happen
objects x fields x passes times, actions once or twice per creep. Making reads
cheap is nearly all of the benefit and costs nothing in expressiveness.

### The cost, honestly

A first pass over the world costs about what the old handle-based path did --
break-even sits near one pass. Every pass after the first is ~60x cheaper. So
the hybrid is neutral for a bot that looks at each object once, and a large win
for anything that scores targets, compares plans, or searches.

### What native tests can and cannot see

`emscripten::val` has no host equivalent. So:

| | Native | WASM |
|---|---|---|
| `constants.h` / `types.h` (`getRange`, ...) | ✅ | ✅ |
| `getTicks` / `getCpuTime` / `getTerrainAt` / `getDirection` | ✅ (faked by `arena::testing`) | ✅ |
| The object model | ❌ | ✅ |

In other words, **code that reads game objects cannot be tested natively.**
`template/` shows the shape that deals with it:

- `src/strategy.cc` -- decisions over plain data. Tests natively, in a second
- `src/bot.cc` -- a thin layer that reads the game, calls strategy, acts

The more of the thinking that lives in strategy, the more of your bot you can
test in the fast loop.

Why the C++ and the JavaScript ship as one package, and what would have to be
true to give up `emscripten::val`, are in [docs/DESIGN.md](docs/DESIGN.md).

---

## The simulator

There is a simple engine. It resolves movement (fatigue, collisions), combat
(melee, ranged, mass attack, healing, towers), harvesting, building, resource
transfer, and spawning.

```js
const world = new World({ width: 20, height: 20 });
world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: ['move', 'work', 'carry'] });
world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });

const match = createMatch({ createArenaBot, world });
match.run(10);

assert.equal(world.creep('c1').store.energy, 20);
```

**It is an approximation, not the real engine.** Which rules come from
measurement, which are assumed from Screeps World, and which are simply not
implemented is all written down in [`sim/FIDELITY.md`](sim/FIDELITY.md). Read it
before you tune anything fine-grained.

---

## Documentation

| | |
|---|---|
| [sim/FIDELITY.md](sim/FIDELITY.md) | **How faithful the simulator is.** What was measured, what is assumed, what is missing. Read before tuning details |
| [docs/ARENA-RUNTIME.md](docs/ARENA-RUNTIME.md) | How the Arena sandbox behaves, why each build flag is set, and how to read a startup failure |
| [docs/DESIGN.md](docs/DESIGN.md) | Constants policy, packaging, the choice of object representation |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Working on this repository itself |
| [docs/LICENSE-NOTES.md](docs/LICENSE-NOTES.md) | Why this licence |

---

## Not measured

Separate from the arena-by-arena checks above, these numbers have never been
taken at all.

- **The real CPU cost of starting the WASM.** It fits the budget -- 2000 ticks
  completed -- but nobody has measured how much of the first tick it eats.
  Adding a `getCpuTime()` call would tell you.
Measured since: a property read through a handle costs about **0.5 microseconds
on the real game**, against 0.24 nanoseconds for the same field once it is in
WASM memory -- roughly 200 000 property reads per 100 ms tick. About 70% of that
half-microsecond is the boundary crossing itself.
`npm run bench` reproduces it locally; see [bench/README.md](bench/README.md)
for what it means for how you write a bot.

---

## Licence

**[MPL-2.0](LICENSE)**, except `template/`, which is [0BSD](template/LICENSE).

The MPL is **file-level** copyleft and draws no distinction between linking
models.

| What you do | What you owe |
|---|---|
| Write, distribute, or keep private a bot | Nothing. Your bot's code is **yours** |
| Use the headers' inline functions and templates | Nothing |
| Link or bundle statically into a WASM module or `main.mjs` | Nothing |
| **Change a file of this library and ship it** | Publish that file's source under the MPL |

The one obligation left to you is telling recipients where this library's source
lives -- and `arenaBundle()` writes that into the top of `dist/main.mjs`
automatically, so **normally you do nothing at all**.

The reasoning and the disclaimer are in
[docs/LICENSE-NOTES.md](docs/LICENSE-NOTES.md).

Screeps: Arena is a game by Screeps LLC. This project is unaffiliated with them
and claims no rights in the game itself.
