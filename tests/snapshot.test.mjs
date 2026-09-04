/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

/**
 * The snapshot record layout is duplicated: an enum in C++, an array in JS.
 * Nothing but this stops them drifting, and drift is silent -- a reordered
 * field means every read quietly returns a different property's value, which is
 * far worse than a crash.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { SNAPSHOT_FIELDS, SNAPSHOT_FIELD_COUNT, createHost } from '../js/host.mjs';

const header = readFileSync(new URL('../include/arena/object.h', import.meta.url), 'utf8');

/** `kX,` -> `x`, `kStoreEnergy,` -> `storeEnergy`. */
function fieldsFromHeader() {
  const block = header.match(/enum class Field : int \{([^}]*)\}/);
  assert.ok(block, 'could not find `enum class Field` in include/arena/object.h');

  // The first entry carries `= 0`, so the initialiser has to be optional.
  return [...block[1].matchAll(/^\s*k(\w+)\s*(?:=[^,]*)?,/gm)]
    .map(([, name]) => name[0].toLowerCase() + name.slice(1))
    .filter((name) => name !== 'count');
}

describe('snapshot layout', () => {
  const fromHeader = fieldsFromHeader();

  it('parses the enum out of the header', () => {
    // Guards the regex: if it stops matching, every assertion below would pass
    // against an empty list.
    assert.ok(fromHeader.length > 10, `only parsed ${fromHeader.length} fields`);
  });

  it('matches js/host.mjs field for field, in order', () => {
    assert.deepEqual(SNAPSHOT_FIELDS, fromHeader);
  });

  it('agrees on the record width', () => {
    assert.match(header, /inline constexpr int kFieldCount = static_cast<int>\(Field::kCount\);/);
    assert.equal(SNAPSHOT_FIELDS.length, fromHeader.length);
  });

  it('can write every field it declares', () => {
    // A field with no column writer throws only when a bot first reads it,
    // which on the Arena means mid-match. Cheaper to find out here.
    const host = createHost({
      utils: { getObjectsByPrototype: () => [] },
      prototypes: {},
      constants: {},
    });

    // One object carrying every property the writers know how to read.
    const object = {
      x: 1, y: 2, exists: true, ticksToDecay: 3, hits: 4, hitsMax: 5,
      my: true, fatigue: 6, spawning: false, energy: 7, energyCapacity: 8,
      amount: 9, progress: 10, progressTotal: 11, cooldown: 12,
      store: { energy: 13, getCapacity: () => 14, getUsedCapacity: () => 15 },
    };

    const unwritable = [];
    for (const [slot, field] of SNAPSHOT_FIELDS.entries()) {
      const view = new Int32Array(SNAPSHOT_FIELD_COUNT);
      try {
        host.snapshotField([object], field, view, slot, SNAPSHOT_FIELD_COUNT);
      } catch (error) {
        unwritable.push(`${field}: ${error.message}`);
      }
    }

    assert.deepEqual(unwritable, []);
  });

  it('uses INT32_MIN as the absent marker on both sides', () => {
    assert.match(header, /inline constexpr std::int32_t kAbsent = INT32_MIN;/);
    const js = readFileSync(new URL('../js/host.mjs', import.meta.url), 'utf8');
    assert.match(js, /const ABSENT = -2147483648;/);
  });
});
