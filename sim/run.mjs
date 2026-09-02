#!/usr/bin/env node
/**
 * Runs the bot locally.
 *
 *   node sim/run.mjs             # run the arena's full tick limit
 *   node sim/run.mjs --ticks 5   # run 5 ticks
 */

import { parseArgs } from 'node:util';

import { createMatch } from './harness.mjs';
import { World } from './world.mjs';

const { values } = parseArgs({
  options: { ticks: { type: 'string', short: 't' } },
});

const world = new World();
const ticks = values.ticks === undefined
  ? world.arenaInfo.ticksLimit
  : Number(values.ticks);

if (!Number.isInteger(ticks) || ticks < 1) {
  console.error(`--ticks must be a positive integer, got ${values.ticks}`);
  process.exit(1);
}

const match = createMatch({
  world,
  onLog: (text, tick) => console.log(`[t${String(tick).padStart(4)}] ${text}`),
});

match.run(ticks);

console.log(`\nran ${ticks} tick(s); API calls: ${JSON.stringify(world.apiCalls)}`);
