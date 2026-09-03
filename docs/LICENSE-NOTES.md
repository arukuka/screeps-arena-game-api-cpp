# Why this licence

**English** | [日本語](LICENSE-NOTES.ja.md)

The [licence section of the README](../README.md#licence) has the conclusion.
This file records why that conclusion was reached.

The choice is **[MPL-2.0](../LICENSE)** (Mozilla Public License 2.0): file-level
copyleft that draws no distinction between linking models.

---

## The one small obligation

MPL §3.1 and §3.2(a) ask that, when you distribute your artifact, you tell
recipients how to obtain this library's Source Code Form. A link to the upstream
repository satisfies it.

**`arenaBundle()` emits that for you**, so normally there is nothing to do. The
top of `dist/main.mjs` carries:

```js
/*
 * This bot embeds screeps-arena-game-api-cpp, which is licensed under the
 * Mozilla Public License, v. 2.0.
 *
 * Source: https://github.com/arukuka/screeps-arena-game-api-cpp
 * Licence: https://mozilla.org/MPL/2.0/
 *
 * The bot's own code is not covered by that licence.
 */
```

You do not have to host the source yourself, and you do not have to publish your
bot. `tests/external/consume.test.mjs` checks that the notice is really there.

## Why not the LGPL

The plain LGPL does not do what this project needs.

1. **This is a header-heavy library.** LGPLv3 §3 exempts header use only up to
   "small macros, inline functions and templates (ten or fewer lines in
   length)". Templates like `getObjectsByPrototype<T>()` are past that limit and
   get compiled into your binary.
2. **Static linking is the only option.** The artifact is a single WASM module
   and a single `main.mjs`; there is no library to swap out. Read literally,
   LGPLv3 §4 would require you to ship your bot's object code or source so that
   somebody could relink it against a modified copy of this library -- the exact
   opposite of "your bot is yours".

Removing those two would take a hand-written exception clause. The MPL **has no
such distinction in the first place**, so the same intent is expressed without
one. It also carries a patent grant and stays GPL-compatible.

## `template/` is licensed separately

It is boilerplate meant to be copied and made your own, so everything under
`template/` is **0BSD** ([template/LICENSE](../template/LICENSE)) instead. No
attribution required, and no MPL notice obligation.

## Disclaimer

I am not a lawyer. The above is the ordinary reading of MPL-2.0, not legal
advice. [Mozilla's FAQ](https://www.mozilla.org/MPL/2.0/FAQ/) is a clear place
to check it against.

## About Screeps: Arena

The constants in `include/arena/constants.h` and `sim/game/constants.mjs`
describe the behaviour of Screeps: Arena, a game published by Screeps LLC. They
are transcribed from the typings the client installs and from measurements taken
in matches. This project claims no rights in Screeps: Arena itself and is not
affiliated with Screeps LLC.
