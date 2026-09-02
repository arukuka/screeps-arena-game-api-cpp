/**
 * The Screeps: Arena entry point. Bundled to `dist/main.mjs` by rollup.
 *
 * Everything below the `createBot()` call is C++; this file exists only to
 * bind the real `game/*` API to the host table and to expose `loop()`.
 */

import { getTicks } from 'game/utils';

import { createHost } from './host.mjs';
import { createBot } from './runtime.mjs';

// Instantiated at module scope, i.e. before the first tick. The Arena grants a
// separate, larger CPU budget for the first tick (`arenaInfo.cpuTimeLimitFirstTick`),
// which is where compiling the WASM belongs.
const bot = createBot(createHost({ utils: { getTicks } }));

export function loop() {
  bot.loop();
}
