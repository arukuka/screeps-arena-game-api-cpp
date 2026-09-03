/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/** Simulated `game` -- the barrel the real runtime also exposes. */

import { world } from './_current.mjs';

export * from './utils.mjs';
export * from './prototypes.mjs';
export * from './constants.mjs';
export * from './path-finder.mjs';
export * from './visual.mjs';

/**
 * `arenaInfo` is a live binding in the real API. A getter keeps it live here
 * too, so it reflects whichever world is currently bound.
 */
export const arenaInfo = new Proxy(
  {},
  {
    get: (_target, key) => world().arenaInfo[key],
    has: (_target, key) => key in world().arenaInfo,
    ownKeys: () => Reflect.ownKeys(world().arenaInfo),
    getOwnPropertyDescriptor: (_target, key) => ({
      ...Object.getOwnPropertyDescriptor(world().arenaInfo, key),
      configurable: true,
    }),
  },
);
