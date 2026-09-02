/**
 * The parts that do not touch `game/*`, so they are safe to import anywhere --
 * including from the simulator and from Node.
 *
 * For the Arena entry point use `screeps-arena-game-api-cpp/arena`, which pulls
 * in the real game API and therefore only loads inside the Arena.
 */

export { createHost } from './host.mjs';
export { createBot } from './runtime.mjs';
