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
