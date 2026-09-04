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

A game object holds an `emscripten::val` handle *and* an index into a per-tick
snapshot. Reads come from the snapshot; actions go through the handle. The
signatures are identical either way, so bot code never learns which is which.

### Why not one or the other

Handles alone cost a boundary crossing per property. A pure snapshot would have
to batch actions too, and batching actions means giving up the result code --
`if (creep.harvest(s) == ERR_NOT_IN_RANGE)` is the shape every Screeps bot is
written in, and it cannot survive an action that answers next tick.

The measurements said that was an unnecessary trade. Reads happen
objects x fields x passes times; actions happen once or twice per creep. Making
reads cheap is nearly all of the benefit, and it costs nothing in expressiveness.

### What is and is not snapshotted

`arena::detail::Field` lists the numeric fields, filled by `snapshotByPrototype`
in `js/host.mjs`. Strings, arrays and nested objects stay on the handle: a
fixed-width int32 record cannot carry them.

Objects from `getObjectById()` and `getObjects()` carry no record and read
through their handles. That is correct but slow per field; prefer
`getObjectsByPrototype()` when reading many fields.

The layouts are duplicated across the language boundary, so
`tests/snapshot.test.mjs` parses the enum out of the header and fails if they
drift, and `tests/objects.test.mjs` reads every field both ways in WASM and
fails on any disagreement. A snapshot that is fast and subtly wrong would not
crash -- the bot would simply decide on the wrong numbers.

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
