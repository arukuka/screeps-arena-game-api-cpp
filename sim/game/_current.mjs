/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * The world the `sim/game/*` modules currently read from.
 *
 * The real Arena API is a set of free functions over implicit global state.
 * The simulator reproduces that shape rather than threading a world argument
 * through everything, so the mock modules can be drop-in replacements.
 */

let current = null;

export function setWorld(world) {
  current = world;
}

export function world() {
  if (current === null) {
    throw new Error('No world bound. Use sim/harness.mjs to run the bot.');
  }
  return current;
}
