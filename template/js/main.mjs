// The Screeps: Arena entry point. `npm run bundle` turns this into
// dist/main.mjs, the single file you copy into your arena source folder.

import { createArenaEntry } from 'screeps-arena-game-api-cpp/arena';

import createArenaBot from '../dist/wasm/bot.mjs';

export const loop = createArenaEntry(createArenaBot);
