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

## Measured on the real game

Pain and Gain, 28 creeps. A "pass" is 28 creeps x 5 fields, so 140 reads.

```
benchmark                       iters     total us        ns/op
-------------------------- ---------- ------------ ------------
getCpuTime()                     1000       1724.4       1724.4   (1 call)
C++ arithmetic                 200000        266.6          1.3   (1 add)
getTicks()                       1000        311.7        311.7   (1 call)
creep.hits()                     2000       4689.8       2344.9   (1 property)
scan creeps: val handles           20       5118.9     255945.2   (1 pass)
scan creeps: C++ snapshot        2000        127.0         63.5   (1 pass)
getObjectsByPrototype              50        235.6       4712.9   (1 call)
```

Per single read:

| | ns per read | vs a C++ add |
|---|---|---|
| property through a val handle | ~1 830 | ~1 400x |
| field from a C++ snapshot | ~0.45 | ~0.35x |

**A property read through a handle costs about 1.8 microseconds.** The tick
budget is 100 ms, so a bot gets roughly **55 000 property reads per tick**.

`getObjectsByPrototype()` is ~4.7 microseconds for 28 creeps, about 170 ns per
object, paid once per prototype per tick before you read a single field.

### The interesting part

Comparing the same benchmark under Node (`npm run bench`) against the Arena:

| | Node | Arena | ratio |
|---|---|---|---|
| property through a handle | ~120-300 ns | ~1 830 ns | **~10x worse** |
| field from a snapshot | ~0.45 ns | ~0.45 ns | same |
| per object in `getObjectsByPrototype` | ~160 ns | ~170 ns | same |

The bulk array call did *not* get more expensive under isolated-vm, and neither
did WASM-local memory. Only the individual round trips did. Whatever the Arena's
sandbox costs, it costs it **per crossing**, so the fix is to make fewer
crossings rather than to do less work.

### Caveats on those numbers

The run above used 20 iterations and a warm-up of three, and it showed: taking a
snapshot appeared 3.5x cheaper than the handle scan performing the identical
reads, which cannot be true. The first pass-level benchmark was paying V8's
tier-up on the next one's behalf.

`measure()` now warms up for `iterations / 2 + 8`, and the pass-level benchmarks
run 60 iterations instead of 20. After that change the two agree locally to
within 1%, as they should. **The absolute figures above are therefore an upper
bound on the handle cost; re-run to get clean ones.**

Also note:

- **`getCpuTime()` is itself a crossing**, at ~1.7 microseconds on the Arena.
  Each measurement makes two of them, which is noise against these totals but
  worth knowing if you time your own bot.
- **`cpuTimeLimit` is in nanoseconds.** The typings give no unit; the raw value
  is 1e8, which is 100 ms read as nanoseconds and absurd read as anything else.
  The first tick gets 1e9, i.e. one second.
- **The simulator is [an approximation](../sim/FIDELITY.md).** Local numbers
  tell you about the boundary, not about a match.

## What to conclude

Taking a snapshot costs roughly what one handle-based pass costs, because it
performs the same reads. Every pass after the first is then essentially free.
So the break-even is around one pass over the world per tick:

- A bot that looks at each object **once** a tick gains nothing from a snapshot.
  Handles are simpler, keep the result codes actions return, and cost the same.
- A bot that looks at the world **repeatedly** -- scoring targets, comparing
  plans, running a search -- pays the full boundary cost every time. At 1.8
  microseconds a read, a search that evaluates a few thousand candidates against
  live handles will not fit in 100 ms. A snapshot turns all but the first pass
  into ordinary memory reads.

So the answer is not "handles are too slow" but "handles are too slow to read
more than once". Read the world into your own structures at the top of the tick
if you are going to traverse it repeatedly; otherwise leave it alone.

The library keeps handles as the default because they read like the JS API and
because most bots are in the first category. [docs/DESIGN.md](../docs/DESIGN.md)
describes what moving the whole API to a snapshot would cost -- chiefly that
actions could no longer return a result in the same tick.
