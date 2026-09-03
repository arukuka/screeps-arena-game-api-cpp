/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * The local simulator.
 *
 * Runs a compiled bot against a simulated game API, so the whole path --
 * C++ -> emscripten::val -> host table -> `game/*` -- is exercised without
 * deploying.
 *
 *   import createArenaBot from '../dist/wasm/bot.mjs';
 *   import { World, createMatch } from 'screeps-arena-game-api-cpp/sim';
 *
 *   const world = new World();
 *   world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: ['move', 'work'] });
 *
 *   const match = createMatch({ createArenaBot, world });
 *   match.run(10);
 *
 * The engine that resolves what the bot asked for is an approximation; see
 * `sim/FIDELITY.md` for what is known to differ from the real one.
 */

export { createMatch } from './harness.mjs';
export { DEFAULT_ARENA_INFO, World } from './world.mjs';
export { beginTick, endTick } from './engine.mjs';
export { setWorld } from './game/_current.mjs';
