/**
 * The simulated match state.
 *
 * Deliberately tiny: it holds exactly what the implemented parts of the API
 * need. Growing the simulator means adding fields here and a reader in
 * `sim/game/`, not restructuring anything.
 */

/** Mirrors the real `arenaInfo` object well enough to drive a local match. */
export const DEFAULT_ARENA_INFO = Object.freeze({
  name: 'Local Simulator',
  season: 'local',
  level: 1,
  ticksLimit: 2000,
  cpuTimeLimit: 50,
  cpuTimeLimitFirstTick: 500,
});

export class World {
  /**
   * @param {object} [options]
   * @param {object} [options.arenaInfo]  overrides for `DEFAULT_ARENA_INFO`
   */
  constructor({ arenaInfo = {} } = {}) {
    this.arenaInfo = Object.freeze({ ...DEFAULT_ARENA_INFO, ...arenaInfo });

    /** The Arena numbers ticks from 1; the bot never observes tick 0. */
    this.tick = 1;

    /**
     * How often the bot reached for each API. The Arena bills wall-clock CPU
     * per tick, and a WASM bot pays that cost at the JS boundary, so counting
     * boundary crossings is the cheapest profiling this simulator can offer.
     */
    this.apiCalls = { getTicks: 0 };
  }

  advance() {
    this.tick += 1;
  }

  get finished() {
    return this.tick > this.arenaInfo.ticksLimit;
  }
}
