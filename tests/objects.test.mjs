/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

/**
 * The hybrid backend reads from a per-tick snapshot instead of crossing into
 * JavaScript. Speed is worthless if the values differ, and a wrong value here
 * does not crash -- the bot just decides on the wrong numbers. So the fixture
 * reads every field both ways and reports mismatches, and this asserts there
 * are none.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { World, createMatch } from '../sim/index.mjs';

import createArenaBot from '../build/fixtures/object_probe.mjs';

/** A world with awkward values: zeroes, partial hits, both owners, a full store. */
function populated() {
  const world = new World({ width: 30, height: 30 });
  world.addCreep({
    id: 'mine', my: true, x: 0, y: 0,
    body: ['move', 'work', 'carry'], hits: 150, fatigue: 4, store: { energy: 30 },
  });
  world.addCreep({ id: 'theirs', my: false, x: 12, y: 7, body: ['attack'] });
  world.addCreep({ id: 'hatching', my: true, x: 3, y: 3, body: ['move'], spawning: true });
  world.addSource({ id: 'src', x: 8, y: 8, energy: 1500, energyCapacity: 3000 });
  world.addSpawn({ id: 'sp', my: true, x: 2, y: 2, hits: 2500 });
  world.addTower({ id: 'tw', my: true, x: 20, y: 20, cooldown: 7 });
  return world;
}

const run = (world, ticks = 1) => {
  const match = createMatch({ createArenaBot, world });
  match.run(ticks);
  return match.logs;
};

describe('snapshot-backed reads', () => {
  it('agrees with the handle on every field', () => {
    const logs = run(populated());

    const mismatches = logs.filter((line) => line.startsWith('MISMATCH'));
    assert.deepEqual(mismatches, []);
    assert.ok(logs.includes('mismatches 0'), logs.join('\n'));
  });

  it('sees every object of each prototype', () => {
    const logs = run(populated());

    assert.ok(
      logs.includes('counts creeps=3 sources=1 spawns=1 towers=1'),
      logs.join('\n'),
    );
  });

  it('keeps agreeing as the world changes under it', () => {
    // A stale snapshot would pass tick 1 and fail here, which is the failure
    // mode worth guarding: the cache is dropped per tick by src/entry.cc.
    const world = populated();
    const logs = run(world, 5);

    assert.deepEqual(logs.filter((line) => line.startsWith('MISMATCH')), []);
    assert.equal(logs.filter((line) => line === 'mismatches 0').length, 5);
  });

  it('drives the visual layer through to the simulator', () => {
    // <arena/visual.h> had no execution path at all until this: it compiled,
    // and that was the whole of what was known about it.
    const world = populated();
    run(world);

    assert.deepEqual(
      world.visuals.map((entry) => entry.op),
      ['circle', 'line', 'rect', 'text', 'poly'],
    );

    const [circle, line, rect, text, poly] = world.visuals;
    assert.equal(circle.layer, 2);
    assert.deepEqual(circle.pos, { x: 3, y: 4 });
    assert.deepEqual(circle.style, { radius: 0.5, fill: '#ff0000' });

    assert.deepEqual(line.from, { x: 0, y: 0 });
    assert.deepEqual(line.to, { x: 5, y: 5 });
    assert.equal(line.style.width, 2);

    assert.deepEqual({ w: rect.w, h: rect.h }, { w: 4, h: 6 });
    assert.equal(text.text, 'hello');
    assert.equal(text.style.align, 'center');
    assert.equal(poly.points.length, 3);
  });

  it('omits visual style fields that were never set', () => {
    // Every style field is optional; an unset one must not reach JS as null,
    // or the game would see it as a deliberate choice rather than a default.
    const world = populated();
    run(world);

    const [circle] = world.visuals;
    assert.deepEqual(Object.keys(circle.style).sort(), ['fill', 'radius']);
  });

  it('reports an empty world without inventing objects', () => {
    const logs = run(new World({ width: 10, height: 10 }));

    assert.ok(logs.includes('counts creeps=0 sources=0 spawns=0 towers=0'), logs.join('\n'));
    assert.ok(logs.includes('mismatches 0'), logs.join('\n'));
  });
});
