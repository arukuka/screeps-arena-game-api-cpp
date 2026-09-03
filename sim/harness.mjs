/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * Runs the compiled WASM bot against a simulated world.
 *
 * This is the local stand-in for `js/arena.mjs`: same host table, same runtime,
 * different `game/*`. Everything between `createHost` and the C++ is shared
 * with production, so a bug here is a bug there.
 */

import { createBot, createHost } from '../js/index.mjs';

import { beginTick, endTick } from './engine.mjs';
import { setWorld } from './game/_current.mjs';
import * as constants from './game/constants.mjs';
import { arenaInfo } from './game/index.mjs';
import * as pathFinder from './game/path-finder.mjs';
import * as prototypes from './game/prototypes.mjs';
import * as utils from './game/utils.mjs';
import * as visual from './game/visual.mjs';
import { World } from './world.mjs';

/**
 * @param {object} options
 * @param {(moduleArg: object) => Promise<object>} options.createArenaBot
 *   the Emscripten factory from your `arena_add_bot()` output
 * @param {World}  [options.world]  the world to run against
 * @param {(text: string, tick: number) => void} [options.onLog]
 * @returns {{ world: World, logs: string[], runTick(): void, run(ticks: number): void }}
 */
export function createMatch({ createArenaBot, world = new World(), onLog }) {
  const logs = [];
  const log = (text) => {
    logs.push(text);
    onLog?.(text, world.tick);
  };

  // Bound before instantiation: the module could read the world while starting.
  setWorld(world);

  // A fresh WASM instance per match. The heap persists across the ticks of one
  // match and nothing leaks into the next, which is what the Arena does too.
  const bot = createBot(
    createArenaBot,
    createHost({ utils, prototypes, constants, pathFinder, visual, arenaInfo, log }),
  );

  return {
    world,
    logs,

    runTick() {
      // Re-bound every tick so two matches can be interleaved in one process,
      // the way mirrored evaluation needs.
      setWorld(world);
      beginTick(world);
      bot.loop();
      endTick(world);
    },

    run(ticks) {
      for (let i = 0; i < ticks; i += 1) {
        this.runTick();
      }
    },
  };
}
