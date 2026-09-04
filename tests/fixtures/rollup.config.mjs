/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import { arenaBundle } from '../../js/rollup.mjs';

// Run from the repository root: `rollup -c tests/fixtures/rollup.config.mjs`.
export default arenaBundle({
  input: 'tests/fixtures/js/main.mjs',
  output: 'dist/api_probe_bot.mjs',
});
