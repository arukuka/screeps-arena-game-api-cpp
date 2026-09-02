/**
 * The local simulator.
 *
 * Runs a compiled bot against a simulated game API, so the whole path --
 * C++ -> EM_JS -> host table -> `game/*` -- is exercised without deploying.
 *
 *   import createArenaBot from '../dist/wasm/bot.mjs';
 *   import { createMatch } from 'screeps-arena-game-api-cpp/sim';
 *
 *   const match = createMatch({ createArenaBot });
 *   match.run(10);
 *
 * `sim/game/*` is reachable too, for tests that want to drive the API directly.
 */

export { createMatch } from './harness.mjs';
export { DEFAULT_ARENA_INFO, World } from './world.mjs';
export { setWorld } from './game/_current.mjs';
