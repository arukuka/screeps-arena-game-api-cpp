# How faithful the simulator is

**English** | [日本語](FIDELITY.ja.md)

This simulator is an **approximation**. It is not the real Screeps: Arena
engine.

What follows is what is known to differ, and how well founded each rule is.
**Behaviour not described here is untested, not verified.** Those are very
different things.

---

## Levels of evidence

| Label | Meaning |
|---|---|
| **Measured** | Measured on the real game. The method is recorded in `include/arena/constants.h` |
| **Documented** | The vendored typings state the value |
| **Assumed** | Screeps World's rule applied as-is. **Not checked against the real game** |
| **Not implemented** | Simply absent |

---

## Measured

These rest on measurements taken in real matches, in
arukuka/screeps-arena-bot.

| Rule | Value | Notes |
|---|---|---|
| Body part cost | move/carry 50, tough 10, attack 80, work 100, ranged_attack 150, heal 250 | Derived by spawning single-part creeps and differencing total energy |
| `rangedAttack` falloff | **none** | `10 × parts` at every range from 1 to 3 |
| `rangedMassAttack` falloff | 1 / 0.4 / 0.1 at range 1 / 2 / 3 | Range 0 is unobservable: you cannot stand on an enemy |
| Spawn energy regeneration | 1 per tick, capped at `SPAWN_ENERGY_CAPACITY` | Neither the typings nor the documentation give a constant |
| Movement fatigue | `2 × non-move parts × terrain` on entering a tile; `2 × move parts` recovered at the start of each tick | **Fatigue is charged for the tile entered, not the one left** |
| Terrain factor | plain 1, swamp 5 | Roads unmeasured |

---

## Assumed (unverified against the real game)

**This is the risky section.** These may differ from the real engine.

### Tower falloff

`TOWER_OPTIMAL_RANGE`, `TOWER_FALLOFF_RANGE` and `TOWER_FALLOFF` are defined
under exactly the names Screeps World uses, so World's formula is applied to
them.

```
distance <= OPTIMAL          -> full power
distance >  OPTIMAL          -> power × (1 - FALLOFF × (min(d, FALLOFF_RANGE) - OPTIMAL) / (FALLOFF_RANGE - OPTIMAL))
```

The judgement was that three constants which plainly mean something are better
modelled than ignored. `tests/engine.test.mjs` pins the expected damage at range
10, so an actual measurement will show up there as a failing test.

### Road movement factor

Roads are unmeasured. The engine treats a road tile as costing no fatigue, but
World's 0.5 is more likely to be right. **Do not trust this in an arena that has
roads.**

### `OBSTACLE_OBJECT_TYPES` and `CONSTRUCTION_COST`

The typings give types without values. The lists in `sim/game/constants.mjs` are
what this engine assumes, not a claim about the game.

From a bot, **read the real values** with `arena::obstacleObjectTypes()` and
`arena::constructionCost()`. `include/arena/constants.h` deliberately does not
guess at them.

---

## Known differences from the real engine

| Item | Real game | Here |
|---|---|---|
| `spawnCreep()` return | Returns the `Creep` immediately | Returns `{}`. The creep is created when the engine applies the intent |
| Finished construction | The completed structure appears | The site just disappears. **Which prototype to build is arena-specific, and guessing would do harm** |
| Movement contention | The engine has internal priority rules | Every creep that wanted the same tile **stays put** |
| `moveTo()` routing | Pathfinding equivalent to `findPath` | One greedy step (straight line, then relax one axis). Use `searchPath` when the route matters |
| `searchPath` | Weighted A* | Dijkstra. Costs and reachability agree, but `ops` and the tie-break between equal-cost paths do not |
| `getCpuTime()` | Elapsed time within the real tick | Node wall-clock time. Close in meaning, not the same |
| Effects (`effects`) | Boosts and modifiers actually apply | Stored only. **Not applied to any calculation** |

---

## Not implemented

- Resource decay (`RESOURCE_DECAY`)
- Road wear (`ROAD_WEAROUT`)
- `pull` (the intent is recorded but never resolved)
- `dismantle` and `repair`
- Ramparts absorbing damage on behalf of what they cover
- Win/loss conditions (they are arena-specific)

---

## What it is good for

Use the simulator for:

- checking the bridge works -- that C++ really reaches `game/*`
- verifying the bot's **decisions** ("retreat when an enemy is close")
- regression tests

Do not use it for:

- **fine** tactical tuning (optimising to the last point of damage)
- predicting match outcomes
- automated parameter search -- optimising against this will drift you away
  from the real game

If you need the details right, measure them on the real game, fold the result
back into here, and pin it in `tests/engine.test.mjs`.
