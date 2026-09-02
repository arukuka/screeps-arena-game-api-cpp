/**
 * Simulated `game/utils`.
 *
 * Signatures must match the real module exactly — `js/host.mjs` consumes this
 * and the production module through the same code path.
 *
 * Only the functions the bot actually calls are implemented. Adding one means:
 *   1. implement it here against `world()`
 *   2. expose it in `js/host.mjs`
 *   3. add an `EM_JS` bridge in `cpp/arena/utils_wasm.cc` and a declaration in
 *      `cpp/arena/utils.h`
 *   4. add a fake in `tests/fakes/` so native unit tests keep building
 */

import { world } from './_current.mjs';

/** The number of ticks passed from the start of the current game. */
export function getTicks() {
  const w = world();
  w.apiCalls.getTicks += 1;
  return w.tick;
}
