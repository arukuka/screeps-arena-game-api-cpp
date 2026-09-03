/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

/** Arena entry point for the benchmark. Built by bench/rollup.config.mjs. */

import { createArenaEntry } from '../../js/arena.mjs';

import createArenaBot from '../../build/bench/bench.mjs';

export const loop = createArenaEntry(createArenaBot);
