/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * The rollup config a bot project needs, so it does not have to rediscover it.
 *
 *   // rollup.config.mjs
 *   import { arenaBundle } from 'screeps-arena-game-api-cpp/rollup';
 *   export default arenaBundle();
 */

/**
 * The attribution the bundle carries.
 *
 * MPL section 3.1 asks that recipients be told the Source Code Form is under
 * the MPL and where to get it. Emitting it as a rollup banner rather than
 * relying on the per-file comments surviving is deliberate: rollup only keeps a
 * leading comment when it stays attached to code that survives tree-shaking,
 * which is not a property to hang a licence notice on.
 *
 * This is the whole of your obligation as a bot author. Your own code is yours.
 */
const NOTICE = `/*
 * This bot embeds screeps-arena-game-api-cpp, which is licensed under the
 * Mozilla Public License, v. 2.0.
 *
 * Source: https://github.com/arukuka/screeps-arena-game-api-cpp
 * Licence: https://mozilla.org/MPL/2.0/
 *
 * The bot's own code is not covered by that licence.
 */
var Date = globalThis.Date ?? class Date {
  #ms;
  constructor(ms = 0) { this.#ms = Number(ms); }
  getTime() { return this.#ms; }
  valueOf() { return this.#ms; }
  getFullYear() { return 1970; }
  getMonth() { return 0; }
  getDate() { return 1; }
  getHours() { return 0; }
  getMinutes() { return 0; }
  getSeconds() { return 0; }
  getMilliseconds() { return 0; }
  toISOString() { return '1970-01-01T00:00:00.000Z'; }
  toTimeString() { return '00:00:00 GMT+0000'; }
  toDateString() { return 'Thu Jan 01 1970'; }
  toString() { return 'Thu Jan 01 1970 00:00:00 GMT+0000'; }
  static now() { return 0; }
};
if (typeof globalThis.Date === 'undefined') {
  try { globalThis.Date = Date; } catch {}
}`;

/**
 * @param {object} [options]
 * @param {string} [options.input]   entry module (default `js/main.mjs`)
 * @param {string} [options.output]  bundle path (default `dist/main.mjs`)
 * @param {string} [options.banner]  replaces the attribution above. Removing it
 *   is your call and your responsibility; the MPL still asks for it somewhere.
 */
export function arenaBundle({
  input = 'js/main.mjs',
  output = 'dist/main.mjs',
  banner = NOTICE,
} = {}) {
  return {
    input,
    // The Arena runtime provides these; bundling them would shadow the real API.
    external: (id) => id === 'game' || id.startsWith('game/'),
    output: {
      file: output,
      format: 'es',
      generatedCode: { preset: 'es2015' },
      banner,
    },
    // No minifier on purpose. The code-size limit is 10 MB and the WASM is
    // already compact, so readable stack traces in the Arena console are worth
    // more than a few kilobytes.
  };
}
