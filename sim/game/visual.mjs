/**
 * Simulated `game/visual`.
 *
 * Nothing is drawn; every call is appended to `world.visuals` so a test can
 * assert on what the bot tried to render.
 */

import { world } from './_current.mjs';

export class Visual {
  constructor(layer = 0, persistent = false) {
    this.layer = layer;
    this.persistent = persistent;
  }

  #record(op, args) {
    world().visuals.push({ layer: this.layer, op, ...args });
    return this;
  }

  clear() { return this.#record('clear', {}); }
  circle(pos, style) { return this.#record('circle', { pos, style }); }
  line(from, to, style) { return this.#record('line', { from, to, style }); }
  poly(points, style) { return this.#record('poly', { points, style }); }
  rect(pos, w, h, style) { return this.#record('rect', { pos, w, h, style }); }
  text(text, pos, style) { return this.#record('text', { text, pos, style }); }

  size() {
    return JSON.stringify(world().visuals).length;
  }
}
