#!/usr/bin/env node
/**
 * Runs the bot locally against the simulator.
 *
 *   npm run sim              # run the arena's full tick limit
 *   npm run sim -- --ticks 5 # run 5 ticks
 */

import { parseArgs } from 'node:util';

import { World, createMatch } from 'screeps-arena-game-api-cpp/sim';

import createArenaBot from '../dist/wasm/bot.mjs';

const { values } = parseArgs({
  options: { ticks: { type: 'string', short: 't' } },
});

const world = new World();
const ticks =
  values.ticks === undefined ? world.arenaInfo.ticksLimit : Number(values.ticks);

if (!Number.isInteger(ticks) || ticks < 1) {
  console.error(`--ticks must be a positive integer, got ${values.ticks}`);
  process.exit(1);
}

const match = createMatch({
  createArenaBot,
  world,
  onLog: (text, tick) => console.log(`[t${String(tick).padStart(4)}] ${text}`),
});

match.run(ticks);

console.log(`\nran ${ticks} tick(s); API calls: ${JSON.stringify(world.apiCalls)}`);
