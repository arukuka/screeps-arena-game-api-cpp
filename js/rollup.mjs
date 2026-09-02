/**
 * The rollup config a bot project needs, so it does not have to rediscover it.
 *
 *   // rollup.config.mjs
 *   import { arenaBundle } from 'screeps-arena-game-api-cpp/rollup';
 *   export default arenaBundle();
 */

/**
 * @param {object} [options]
 * @param {string} [options.input]   entry module (default `js/main.mjs`)
 * @param {string} [options.output]  bundle path (default `dist/main.mjs`)
 */
export function arenaBundle({
  input = 'js/main.mjs',
  output = 'dist/main.mjs',
} = {}) {
  return {
    input,
    // The Arena runtime provides these; bundling them would shadow the real API.
    external: (id) => id === 'game' || id.startsWith('game/'),
    output: {
      file: output,
      format: 'es',
      generatedCode: { preset: 'es2015' },
    },
    // No minifier on purpose. The code-size limit is 10 MB and the WASM is
    // already compact, so readable stack traces in the Arena console are worth
    // more than a few kilobytes.
  };
}
