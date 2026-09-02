/**
 * Instantiates the WASM module and hands back something the Arena can drive.
 *
 * The interesting part is that this is *synchronous*. Emscripten's factory is
 * declared `async`, but with `-sWASM_ASYNC_COMPILATION=0` and
 * `-sENVIRONMENT=shell` the generated code runs all the way through
 * `createWasm()` -- which attaches the exports onto the object we passed in --
 * before it reaches its first `await`. So `module._arena_loop` is already there
 * when the call returns, and `main.mjs` needs no top-level await.
 *
 * That matters: we cannot verify how the Arena sandbox evaluates an entry
 * module with a pending top-level await, and a bot that misses its first ticks
 * is a bot that loses. Keep `shell` in `-sENVIRONMENT`; adding `node` puts an
 * `await import("node:module")` ahead of instantiation and breaks this.
 *
 * Everything this module reports is reported from `loop()`, never from module
 * scope. The Arena does not surface console output written while the entry
 * module is being evaluated -- only what a tick writes reaches the match log.
 */

import createArenaBot from '../dist/wasm/bot.mjs';

/** The 8-byte header that is, on its own, a valid empty WASM module. */
const EMPTY_WASM_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

/** 16 MB expressed in WASM pages -- what `-sINITIAL_MEMORY` asks for. */
const INITIAL_MEMORY_PAGES = 256;

/** The one line that identifies a failure, with no stack to get clipped. */
function summarise(error) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

/**
 * Asks the runtime what it can actually do.
 *
 * Run only after a failure, to tell three very different causes apart: WASM
 * missing outright, WASM present but code generation refused by the embedder,
 * and a heap reservation the isolate will not grant.
 */
function probeRuntime() {
  const notes = [`typeof WebAssembly = ${typeof WebAssembly}`];

  if (typeof WebAssembly === 'undefined') {
    return notes;
  }

  try {
    new WebAssembly.Module(EMPTY_WASM_MODULE);
    notes.push('compile an empty module: ok');
  } catch (error) {
    notes.push(`compile an empty module: ${summarise(error)}`);
  }

  try {
    new WebAssembly.Memory({ initial: INITIAL_MEMORY_PAGES });
    notes.push(`reserve ${INITIAL_MEMORY_PAGES} pages (16MB): ok`);
  } catch (error) {
    notes.push(`reserve ${INITIAL_MEMORY_PAGES} pages (16MB): ${summarise(error)}`);
  }

  return notes;
}

/** What Emscripten's preamble binds off `console` before it can be overridden. */
const REQUIRED_CONSOLE_METHODS = ['log', 'warn', 'error'];

const isMethod = (target, name) => typeof target?.[name] === 'function';

/**
 * Fills in the console methods the Arena does not provide.
 *
 * The Arena's console implements `log()` and not much else. Emscripten's shell
 * preamble opens with:
 *
 *     if (globalThis.print) { console.warn ??= console.error ??= ... }
 *     var out = console.log.bind(console);
 *     var err = console.error.bind(console);
 *
 * Its own shim is guarded on `globalThis.print`, which the Arena does not
 * define, so `console.error` stays undefined and `.bind` throws a TypeError --
 * and that happens *before* `Module.print`/`printErr` are read, so passing them
 * cannot help. The gaps have to be filled before the factory is called.
 */
function ensureConsoleMethods(log) {
  const existing = globalThis.console;

  if (REQUIRED_CONSOLE_METHODS.every((name) => isMethod(existing, name))) {
    return;
  }

  for (const name of REQUIRED_CONSOLE_METHODS) {
    if (isMethod(existing, name)) continue;
    try {
      existing[name] = log;
    } catch {
      // Absent or frozen console; replaced below.
    }
  }

  if (REQUIRED_CONSOLE_METHODS.every((name) => isMethod(globalThis.console, name))) {
    return;
  }

  // Install one of our own, keeping whatever the runtime did provide.
  const replacement = {};
  for (const name of REQUIRED_CONSOLE_METHODS) {
    replacement[name] = isMethod(existing, name)
      ? existing[name].bind(existing)
      : log;
  }
  globalThis.console = replacement;
}

/**
 * @param {object} host  the table from `createHost()`
 * @returns {{ loop: () => void }}
 */
export function createBot(host) {
  ensureConsoleMethods(host.log);

  const module = {
    arena: host,
    // Emscripten routes stdout/stderr here, so printf and std::cout in C++
    // land in the Arena console.
    print: host.log,
    printErr: host.log,
  };

  // The factory is `async`, so a failure inside instantiation arrives as a
  // rejected promise rather than a throw -- too late to read from here.
  let failure = null;
  let failed = false;
  createArenaBot(module).catch((error) => {
    failure = error;
    failed = true;
  });

  let run = module._arena_loop ?? null;
  let reported = false;

  return {
    loop() {
      run ??= module._arena_loop ?? null;

      if (run !== null) {
        run();
        return;
      }

      if (!failed) {
        host.log('[wasm] module still initialising; tick skipped');
        return;
      }

      if (reported) {
        host.log('[wasm] bot disabled by the failure reported above; tick skipped');
        return;
      }

      reported = true;

      // Summary first, then the probe, then the stack. The console may clip a
      // long line, and the first two are what actually identify the cause.
      host.log(`[wasm] instantiation failed: ${summarise(failure)}`);
      for (const note of probeRuntime()) {
        host.log(`[wasm]   ${note}`);
      }
      if (failure?.stack) {
        host.log(`[wasm] stack: ${failure.stack}`);
      }
    },
  };
}
