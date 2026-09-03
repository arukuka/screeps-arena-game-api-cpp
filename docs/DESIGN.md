# Design decisions

**English** | [日本語](DESIGN.ja.md)

Why things are the way they are. You do not need this to use the library, but
when something annoys you, the reason it was not done differently is here.

---

## The constants policy

`include/arena/constants.h` **does not guess**.

- The typings give a value → transcribed as-is.
- The typings give only a type, but somebody measured it in a real match
  (`BODYPART_COST`, `rangedMassAttackRate`, `SPAWN_ENERGY_REGEN`, the fatigue
  rules) → defined, **with the measurement method recorded in a comment**.
- No value and no measurement (`OBSTACLE_OBJECT_TYPES`, `RESOURCES_ALL`,
  `CONSTRUCTION_COST`) → **not defined at all**. Read them from the running
  game with `arena::obstacleObjectTypes()` and friends.

`getDirection()` is missing from the C++ side for the same reason. Chebyshev
distance (`getRange`) is a certainty, so it is computed in C++; the rule that
rounds an arbitrary delta onto eight compass directions is a game rule, and
guessing at it would produce quietly wrong moves.

The measured values come from arukuka/screeps-arena-bot `src/constants.ts`.

---

## Packaging

### Why the C++ ships through npm

The names `src/bridge.cc` calls and the keys in `host.mjs` have to match. If the
C++ and the JavaScript could be fetched through separate channels -- say
FetchContent and npm -- then **a mismatched pair would install cleanly and
nobody would notice**. One package at one version rules that failure out by
construction.

---

## Object representation

Today a game object is an `emscripten::val` handle. That maps one-to-one onto
the JS API and reads well, at the cost of one round trip across the JS boundary
per property.

The Arena bills wall-clock CPU per tick (`arenaInfo.cpuTimeLimit`), so once
you are seriously running 50 creeps and CPU starts to bite, consider moving to a
snapshot design: write the whole state into WASM linear memory **once** at the
top of the tick and read it as plain structs.

The `apiCalls` counter in `sim/world.mjs` and
`arena::testing::getTicksCallCount()` exist to count boundary crossings, and
`bench/` measures what one costs. The numbers, from Pain and Gain: about 0.5
microseconds per property read through a handle, against 0.24 nanoseconds for
the same field in WASM memory, with a 100 ms tick budget. About 70% of that read
is the crossing itself, which is why a bulk snapshot -- one crossing for the
whole world -- pays for itself after less than half a pass.

It would not be cheap. Properties become struct fields, and actions stop
returning a result within the same tick -- the `ERR_NOT_IN_RANGE` branch that
every Screeps player writes would no longer be possible. The API changes shape.
