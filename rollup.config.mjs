/**
 * Bundles the entry point and the Emscripten glue into the single `main.mjs`
 * the Arena expects.
 *
 * The `game/*` modules stay external: the Arena runtime provides them, and the
 * simulator never goes through this bundle at all.
 *
 * No minifier on purpose. The code-size limit is 10 MB and the WASM is already
 * compact, so readable stack traces in the Arena console are worth more than a
 * few kilobytes.
 */

export default {
  input: 'js/main.mjs',
  external: (id) => id === 'game' || id.startsWith('game/'),
  output: {
    file: 'dist/main.mjs',
    format: 'es',
    // The Emscripten glue reads `import.meta.url`; keep it intact.
    generatedCode: { preset: 'es2015' },
  },
};
