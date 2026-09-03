/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * The parts that do not touch `game/*`, so they are safe to import anywhere --
 * including from the simulator and from Node.
 *
 * For the Arena entry point use `screeps-arena-game-api-cpp/arena`, which pulls
 * in the real game API and therefore only loads inside the Arena.
 */

export { createHost } from './host.mjs';
export { createBot } from './runtime.mjs';
