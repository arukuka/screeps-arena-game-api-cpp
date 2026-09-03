/**
 * The Arena-side entry point.
 *
 * Importing this module pulls in `game/*`, which only exists inside the Arena
 * runtime -- so nothing under `sim/` may import it, and neither may any code
 * you want to run locally.
 */

import * as constants from 'game/constants';
import * as pathFinder from 'game/path-finder';
import * as prototypes from 'game/prototypes';
import * as utils from 'game/utils';
import * as visual from 'game/visual';
import { arenaInfo } from 'game';

import { createHost } from './host.mjs';
import { createBot } from './runtime.mjs';

/**
 * Wires a compiled bot to the real game API.
 *
 *   import createArenaBot from '../dist/wasm/bot.mjs';
 *   import { createArenaEntry } from 'screeps-arena-game-api-cpp/arena';
 *
 *   export const loop = createArenaEntry(createArenaBot);
 *
 * The WASM is instantiated when this is called, i.e. while the entry module is
 * being evaluated and before the first tick. That is deliberate: the Arena
 * grants a separate, larger CPU budget for the first tick
 * (`arenaInfo.cpuTimeLimitFirstTick`), which is where compiling belongs.
 *
 * @param {(moduleArg: object) => Promise<object>} createArenaBot
 * @returns {() => void} the function to export as `loop`
 */
export function createArenaEntry(createArenaBot) {
  const bot = createBot(
    createArenaBot,
    createHost({ utils, prototypes, constants, pathFinder, visual, arenaInfo }),
  );
  return () => bot.loop();
}
