/**
 * The host table: the one place that maps the Screeps: Arena JS API onto the
 * names the WASM module calls (see `cpp/arena/utils_wasm.cc`).
 *
 * Both entry points go through here -- `js/main.mjs` passes the real `game/*`
 * modules, `sim/harness.mjs` passes the simulated ones -- so the simulator
 * cannot drift from production by wiring something up differently.
 */

/**
 * @param {object}   deps
 * @param {object}   deps.utils  the `game/utils` module (real or simulated)
 * @param {(text: string) => void} [deps.log]  where `printf` output goes
 * @returns {object} the table exposed to C++ as `Module.arena`
 */
export function createHost({ utils, log = (text) => console.log(text) }) {
  return {
    // Passed by reference rather than wrapped in an arrow: every call crosses
    // the WASM boundary once per use, and the Arena bills wall-clock CPU.
    getTicks: utils.getTicks,
    log,
  };
}
