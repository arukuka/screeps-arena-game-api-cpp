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

> These measure the handle-based path the library used before the hybrid, and
> are kept because they are what motivated the change. Current figures are
> under "The final numbers" below.


Pain and Gain, 28 creeps. A "pass" is 28 creeps x 5 fields, so 140 reads.

```
benchmark                       iters     total us        ns/op
-------------------------- ---------- ------------ ------------
getCpuTime()                     1000       1268.8       1268.8   (1 call)
C++ arithmetic                 200000        266.6          1.3   (1 add)
getTicks()                       1000        877.5        877.5   (1 call)
creep.hits()                     2000       4458.1       2229.0   (1 property)
scan creeps: val handles           60       4183.1      69717.8   (1 pass)
take snapshot                      60       4534.0      75566.5   (1 pass)
scan creeps: C++ snapshot        2000         67.3         33.7   (1 pass)
bulk snapshot (1 crossing)        200       5409.5      27047.4   (1 pass)
scan creeps: bulk buffer         2000        115.6         57.8   (1 pass)
getObjectsByPrototype             200       1125.8       5628.8   (1 call)

wasm memory: ~1 MB used of 16 MB
```

Per single read:

| | ns per read |
|---|---|
| property through a val handle | ~500 |
| field from WASM memory | ~0.24 |

**A property read through a handle costs about half a microsecond.** With a
100 ms tick budget that is roughly **200 000 property reads per tick** -- far
more headroom than the first, warm-up-inflated run suggested.

### Where the half microsecond goes

The bulk snapshot enumerates the creeps and then reads the same 140 fields, but
from JavaScript. Subtracting the enumeration gives the cost of a property read
that never crosses the boundary at all:

| | ns per read |
|---|---|
| reading an Arena object's property, from JS | ~150 |
| the WASM boundary on top of that | ~350 |
| **total, through a handle** | **~500** |

So roughly **70% of a handle read is the crossing** and 30% is the Arena's own
object being read at all. A snapshot removes the first part and pays the second
once.

That also explains why the bulk snapshot is only 3x cheaper than the naive one
here, against 8x under Node: the Arena's game objects are themselves expensive
to read, and no amount of batching makes that part go away.

### An unresolved discrepancy

`creep.hits()` measured in isolation reports ~2 230 ns, while the same kind of
read inside the scan works out at ~500 ns. Repeatedly reading one property of
one object should be the *faster* case, not 4x slower, and no explanation has
survived scrutiny yet.

Treat the per-read figure as a range of roughly 500-2 200 ns. The scan number is
the one used above, because scanning is what bots actually do.

## Is 16 MB of heap enough?

The benchmark reports actual usage. On the real game a bot doing ordinary work
sits at about **1 MB of 16 MB**, and most of that is the 1 MB stack.

Raising `INITIAL_MEMORY` is the way to get more. **Do not turn on
`ALLOW_MEMORY_GROWTH`**: growing detaches the WASM `ArrayBuffer`, and every
JS-side view over it -- including the one `snapshotCreeps` writes through --
becomes detached, with writes silently going nowhere.
`cmake/ArenaBot.cmake` records the full reasoning next to the flag.

## The final numbers

Pain and Gain, 28 creeps, three runs of the shipped implementation:

```
scan: raw handles          53,046 / 53,084 / 63,956 ns   (1 pass, pre-hybrid path)
scan: hybrid accessors        923 /    936 /    926 ns   (1 pass, from memory)
first pass (cold)          47,430 / 52,475 / 65,462 ns   (query + wrap + 5 columns)
break-even                   0.91 /   1.01 /   1.04 passes
```

A pass costs ~60x less once the columns are loaded, and the first pass costs
about what the handle path did. So the hybrid never loses, and wins as soon as
anything reads the world twice.

### The attempts that did not work

Each was tried on the real game, and each was worse. They are recorded because
the reasoning behind them was plausible, and plausible is not evidence.

| Attempt | Result |
|---|---|
| Fixed 18-field record, filled eagerly | 104 us a tick. **Worse than no snapshot** -- most fields were never asked for |
| Per-prototype field sets, still eager | Better, but still pays for fields the bot does not read |
| One specialised loop per field | **1.43x worse** than one shared loop |
| One loop reading a whole 9-field record | **2.9x worse**, and the least stable |

The last two were written on the theory that a monomorphic call site, or a
single hot function, would let V8 optimise better. Neither survived
measurement. What actually predicts the cost is the number of properties read
off Arena game objects -- 11 reads beat 5 reads never, whatever shape the loop
has.

Hence lazy columns: read each field at most once a tick, and read no field
nobody asked for.

---

## What to conclude

A bulk snapshot costs about a tenth of a single handle-based pass, and every
pass after it is essentially free. There is no crossover point worth arguing
about: **if the data is going to be read at all, it is cheaper to snapshot it.**

That is a stronger result than the first run suggested, and it came from fixing
the benchmark rather than from any change to the library.

What it does *not* argue for is batching actions. The measurements say the cost
is in reads:

| | cost | how often a bot does it |
|---|---|---|
| property read | ~1.8 us (Arena) | objects x fields x passes |
| action (`harvest`, `moveTo`, ...) | one crossing | once or twice per creep |

So the shape worth building is a **hybrid**: reads served from a snapshot,
actions still sent immediately through the handle. That keeps
`if (creep.harvest(s) == ERR_NOT_IN_RANGE)` working -- the pattern every Screeps
player writes -- while removing the per-field cost that actually hurts.

Crucially, that combination changes no signatures, so bot code does not have to
know which backend it is on. See [docs/DESIGN.md](../docs/DESIGN.md).
