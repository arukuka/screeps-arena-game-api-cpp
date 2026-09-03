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
 */`;

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
