# What the JS boundary costs

**English** | [日本語](README.ja.md)

The object model hands the bot `emscripten::val` handles, so every property read
is a round trip into JavaScript. The alternative is to copy the world into WASM
memory once per tick and read plain structs afterwards. Which is better depends
entirely on the ratio between those, and the README used to say -- honestly --
that nobody had measured it.

```sh
npm run bench                # 50 creeps
npm run bench -- --creeps 5
```

## Reading the output

```
benchmark                       iters     total us        ns/op
-------------------------- ---------- ------------ ------------
C++ arithmetic                 200000        168.0          0.8   (1 add)
getTicks()                       1000        243.9        243.9   (1 call)
creep.hits()                     2000        888.7        444.3   (1 property)
scan creeps: val handles           20        614.9      30745.8   (1 pass)
take snapshot                      20        571.6      28581.3   (1 pass)
scan creeps: C++ snapshot        2000        222.2        111.1   (1 pass)
getObjectsByPrototype              50        390.5       7810.0   (1 call)
```

A "pass" is 50 creeps x 5 fields, so 250 reads. The three lines that matter:

| | ns per pass | ns per field |
|---|---|---|
| through val handles | ~30 000 | ~120 |
| from a C++ snapshot | ~110 | ~0.4 |

**A property read costs roughly 300x what the same read costs once the data is
in WASM memory**, and about 150 times a C++ addition. That is the number the
design question turns on.

`getObjectsByPrototype()` is ~8 microseconds for 50 creeps -- around 160 ns per
object, paid once per prototype per tick, on top of every field you then read.

## What it does not tell you

- **These are Node numbers.** The Arena runs user code under isolated-vm, not
  plain Node. The *ratio* should carry across, since both are V8 doing the same
  work, but the absolute figures will not.
- **`getCpuTime()` here is the simulator's implementation**, which counts the
  call and reads `performance.now()`. Its own cost (~1 microsecond) says nothing
  about the real one. It only appears in the table to show that the two calls
  each measurement makes are negligible against the totals.
- **Nothing here is a claim about a real match.** The simulator is
  [an approximation](../sim/FIDELITY.md).

For numbers that decide something, deploy it:

```sh
ARENA_DIR=~/ScreepsArena/season4-pain_and_gain npm run bench:deploy
```

It runs one benchmark per tick -- the Arena bills wall-clock CPU per tick, and a
single tick attempting all of them would be killed -- and prints the table on
tick 9. Iteration counts are sized to stay well inside a 50 ms budget; lower
them in `bench/bench.cc` if a tick gets cut off.

## What to conclude

Break-even sits at about one pass over the world per tick: taking a snapshot
costs about what one handle-based pass costs, and every pass after that is
essentially free. So:

- A bot that looks at each creep **once** per tick gains nothing from a
  snapshot. Handles are simpler and cost the same.
- A bot that looks at the world **repeatedly** -- scoring targets, evaluating
  several plans, running a search -- pays the full boundary cost every time, and
  a snapshot turns all but the first pass into ordinary memory reads.

The current design keeps handles because they read like the JS API and preserve
the result codes actions return. If profiling on the real game shows the
boundary eating the tick budget, [docs/DESIGN.md](../docs/DESIGN.md) describes
what moving to a snapshot would cost in API changes.
