# The Arena runtime and the build flags

**English** | [日本語](ARENA-RUNTIME.ja.md)

What the Screeps: Arena sandbox (isolated-vm) actually does, learned from
running against it, and the Emscripten link flags derived from that.

**You normally do not need this.** `arena_add_bot()` handles all of it. This is
here for when you have to touch a flag, and for when startup fails.

---

## What the Arena sandbox turned out to do

Established from real logs. None of it is in the official documentation.

### WebAssembly works

Probed on the real game:

```
typeof WebAssembly = object
compile an empty module: ok
reserve 256 pages (16MB): ok
```

**The approach is viable.** A bot has since run the full 2000 ticks.

### `console` only has `log()`

`console.error` and `console.warn` are **undefined**. Emscripten's shell
preamble reads:

```js
if (globalThis.print) { console.warn ??= console.error ??= ...; }  // skipped: no `print`
var out = console.log.bind(console);
var err = console.error.bind(console);   // ← TypeError
```

Its own fallback is guarded on `globalThis.print`, which the Arena does not
define, so the fallback is skipped entirely and `.bind` throws. Worse, this runs
*before* `Module.print` / `printErr` are read, so supplying them cannot help.

`ensureConsoleMethods()` in `js/runtime.mjs` fills the gaps before
instantiation. `tests/harness.test.mjs` covers two cases -- a console with only
`log()`, and a frozen one -- and both were confirmed to fail without the shim.

### Console output during module evaluation never reaches the match log

Only what a tick writes gets through. Always report diagnostics from `loop()`.

---

## Why each build flag is set

Every link option in `cmake/ArenaBot.cmake` was derived from a failure on the
real game. Two of them **break things if changed**.

### `-sENVIRONMENT=shell` (never add `node`)

The factory Emscripten generates is an `async function`, but combined with
`-sWASM_ASYNC_COMPILATION=0` it runs all the way through `createWasm()` --
which writes the exports onto the object you passed in -- **before it reaches
its first `await`**. So `module._arena_loop` is already there the moment
`createArenaBot(module)` returns.

Add `node` and the generated code opens with:

```js
if (ENVIRONMENT_IS_NODE) { const {createRequire} = await import("node:module"); ... }
```

which puts an `await` ahead of instantiation and destroys that property.
Confirmed by measurement.

Why the insistence on synchronous startup: **so the entry module needs no
top-level await.** How the Arena sandbox evaluates an entry module with a
pending top-level await cannot be verified from outside, and a bot that misses
its first few ticks loses. A side benefit is that this configuration emits no
`import.meta` either.

### `-sSINGLE_FILE=1` plus `-sSINGLE_FILE_BINARY_ENCODE=0`

The first embeds the `.wasm` into the `.mjs`. The Arena does accept multiple
files (10 MB of code in total), but a single file means never having to think
about how a binary is handled.

`SINGLE_FILE_BINARY_ENCODE=0` is the important half. Emscripten 6 defaults to a
**custom binary string encoding** rather than base64. It is about 25% smaller,
and in exchange it requires the file to survive transport as UTF-8 -- which
Emscripten's own documentation states.

Left at the default, the output is a **binary file** containing over 2900
control characters. The Arena's path -- client reads the file → jszip → upload →
server → isolated-vm -- promises no byte transparency, and one mangled byte is a
`WebAssembly.CompileError` at startup.

Base64 is pure ASCII. `tests/external/consume.test.mjs` asserts that the
generated `dist/main.mjs` really is.

The rest:

- `-sINVOKE_RUN=0` -- there is no `main()`; the Arena drives `loop()`.
- `-sALLOW_MEMORY_GROWTH=0` with `-sINITIAL_MEMORY=16MB` -- keeps heap growth
  off the tick's CPU budget. If it runs short, raise the initial size rather
  than enabling growth.
- `--bind` -- embind is required because the object model uses
  `emscripten::val`. The entry point the Arena calls (`arena_loop()`) is
  exported with `EMSCRIPTEN_KEEPALIVE` rather than through embind: it takes no
  arguments and returns nothing, so there is nothing for embind to do there.

---

## Reading a startup failure

`js/runtime.mjs` **never guesses at the cause; it reports what the runtime
said.** Emscripten's factory is `async`, so an exception during instantiation
arrives as a rejected promise rather than a throw. Diagnostics are always
emitted from `loop()`, because (as above) output during module evaluation never
reaches the match log.

```
[wasm] instantiation failed: CompileError: WebAssembly.Module(): ...
[wasm]   typeof WebAssembly = object
[wasm]   compile an empty module: ok
[wasm]   reserve 256 pages (16MB): ok
[wasm] stack: CompileError: ...
```

The first line is the summary, the `[wasm]   ` lines are probes of the runtime,
and the stack comes last. That order is deliberate: if the console clips a long
line, the summary and the probes survive.

| Probe output | Meaning |
|---|---|
| `typeof WebAssembly = undefined` | No WASM in the sandbox. The whole approach is off the table |
| `compile an empty module:` fails | WASM exists but the embedder forbids code generation. An 8-byte empty module will not compile, so this is not your code |
| `reserve 256 pages (16MB):` fails | The isolate's memory limit. Lower `-sINITIAL_MEMORY` |
| everything `ok` | The runtime is fine; the error on the first line is a problem with your artifact |

When every probe says `ok`, read the first line:

- `CompileError` → the embedded payload is corrupt. Check the pure-ASCII
  assertion.
- `TypeError: Cannot read properties of undefined (reading 'bind')` → the
  sandbox is missing a console method. Add it to `REQUIRED_CONSOLE_METHODS` in
  `ensureConsoleMethods()`.

A failed startup does not throw during module evaluation. The bot skips ticks
and keeps running. It loses the match, but **the reason stays in the console**,
which is what makes it diagnosable.
