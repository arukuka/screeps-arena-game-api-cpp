/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

/**
 * Runs bench/bench.cc against the simulator.
 *
 *   npm run bench                # 50 creeps, the default
 *   npm run bench -- --creeps 5
 *
 * These are Node numbers, not Arena numbers. The ratio between a handle read
 * and a snapshot read should carry across -- both are the same V8 doing the
 * same work -- but the absolute figures will not, and the Arena runs under
 * isolated-vm rather than plain Node. See bench/README.md before quoting any
 * of it.
 */

import { parseArgs } from 'node:util';

import { World, createMatch } from '../sim/index.mjs';

import createArenaBot from '../build/bench/bench.mjs';

const { values } = parseArgs({ options: { creeps: { type: 'string', short: 'c' } } });
const creepCount = values.creeps === undefined ? 50 : Number(values.creeps);

if (!Number.isInteger(creepCount) || creepCount < 0) {
  console.error(`--creeps must be a non-negative integer, got ${values.creeps}`);
  process.exit(1);
}

const world = new World({ width: 50, height: 50 });

// A plausible mid-game board: creeps on both sides, plus the structures a bot
// would also be reading. The benchmark only scans creeps, but the rest being
// present keeps `getObjectsByPrototype` filtering over a realistic population.
for (let i = 0; i < creepCount; i += 1) {
  world.addCreep({
    id: `c${i}`,
    my: i % 2 === 0,
    x: 5 + (i % 40),
    y: 5 + Math.floor(i / 40),
    body: ['move', 'attack', 'tough', 'heal'],
  });
}
world.addSpawn({ id: 'sp0', my: true, x: 2, y: 2 });
world.addSpawn({ id: 'sp1', my: false, x: 47, y: 47 });
for (let i = 0; i < 10; i += 1) {
  world.addSource({ id: `s${i}`, x: 10 + i, y: 25, energy: 3000 });
}

const match = createMatch({ createArenaBot, world, onLog: (text) => console.log(text) });

// bench.cc runs one benchmark per tick and reports on the last one.
match.run(13);

console.log(`\nboundary crossings this run: ${JSON.stringify(world.apiCalls)}`);
