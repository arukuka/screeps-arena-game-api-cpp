/**
 * The C++ header and the simulator must agree on every constant.
 *
 * They are separate transcriptions of the same vendored typings, so nothing
 * stops them drifting apart -- except this. A bot that plans with one set of
 * numbers while the simulator scores it with another is worse than useless:
 * it looks like it works.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as sim from '../sim/game/constants.mjs';

const header = readFileSync(new URL('../include/arena/constants.h', import.meta.url), 'utf8');

/** `inline constexpr <type> NAME = <value>;`, ignoring comments. */
function parseHeader() {
  const values = new Map();
  const pattern =
    /^inline constexpr (?:int|double|bool|std::string_view) (\w+) = ([^;]+);/gm;

  for (const [, name, raw] of header.matchAll(pattern)) {
    const text = raw.trim();
    if (text.startsWith('"')) values.set(name, text.slice(1, -1));
    else if (text === 'true' || text === 'false') values.set(name, text === 'true');
    else values.set(name, Number(text));
  }
  return values;
}

describe('constants', () => {
  const fromHeader = parseHeader();

  it('parses a plausible number of values out of the header', () => {
    // Guards the regex itself: if it silently stops matching, every comparison
    // below would pass vacuously.
    assert.ok(fromHeader.size > 60, `only parsed ${fromHeader.size}`);
  });

  it('agrees with the simulator on every shared name', () => {
    const mismatches = [];
    let compared = 0;

    for (const [name, value] of fromHeader) {
      if (!(name in sim)) continue;
      compared += 1;
      if (sim[name] !== value) {
        mismatches.push(`${name}: header ${value} vs sim ${sim[name]}`);
      }
    }

    assert.deepEqual(mismatches, []);
    assert.ok(compared > 60, `only compared ${compared} constants`);
  });

  it('defines every constant the simulator exports as a scalar', () => {
    const missing = [];
    for (const [name, value] of Object.entries(sim)) {
      if (typeof value === 'object' || typeof value === 'function') continue;
      if (name === 'RANGED_ATTACK_HAS_NO_FALLOFF') continue;
      if (!fromHeader.has(name)) missing.push(name);
    }
    assert.deepEqual(missing, [], 'add these to include/arena/constants.h');
  });

  it('keeps the measured body part costs in step', () => {
    // bodyPartCost() is a constexpr function, so the regex above cannot see it.
    for (const [part, cost] of Object.entries(sim.BODYPART_COST)) {
      assert.match(
        header,
        new RegExp(`if \\(part == \\w+\\) return ${cost};`),
        `no ${cost} for ${part}`,
      );
    }
  });
});
