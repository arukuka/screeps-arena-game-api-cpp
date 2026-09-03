/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0 */

/**
 * Simulated `game/path-finder`.
 *
 * A plain Dijkstra over the terrain grid with the cost matrix applied. The real
 * engine uses weighted A*, so `ops` here is a count of expanded nodes rather
 * than the game's number, and a tie between equal-cost paths may break the
 * other way. Costs and reachability match.
 */

import { world } from './_current.mjs';
import { TERRAIN_SWAMP, TERRAIN_WALL } from './constants.mjs';

export class CostMatrix {
  constructor(values) {
    this.values = values ?? new Uint8Array(2500);
  }

  get(x, y) {
    return this.values[y * 50 + x] ?? 0;
  }

  set(x, y, cost) {
    this.values[y * 50 + x] = cost;
  }

  clone() {
    return new CostMatrix(Uint8Array.from(this.values));
  }
}

const NEIGHBOURS = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export function searchPath(origin, goal, options = {}) {
  const state = world();
  const {
    costMatrix,
    plainCost = 2,
    swampCost = 10,
    maxOps = 50000,
    maxCost = Infinity,
  } = options;

  const goals = (Array.isArray(goal) ? goal : [goal]).map((entry) =>
    entry.pos === undefined ? { pos: entry, range: 0 } : entry,
  );
  const reached = (x, y) =>
    goals.some((g) => Math.max(Math.abs(g.pos.x - x), Math.abs(g.pos.y - y)) <= (g.range ?? 0));

  const tileCost = (x, y) => {
    const custom = costMatrix?.get(x, y) ?? 0;
    if (custom === 255) return null;
    if (custom > 0) return custom;

    const terrain = state.getTerrainAt(x, y);
    if (terrain === TERRAIN_WALL) return null;
    return terrain === TERRAIN_SWAMP ? swampCost : plainCost;
  };

  const key = (x, y) => y * state.width + x;
  const cost = new Map([[key(origin.x, origin.y), 0]]);
  const cameFrom = new Map();
  // A sorted array rather than a heap: arenas are small and this keeps the
  // implementation short enough to read.
  let frontier = [{ x: origin.x, y: origin.y, cost: 0 }];
  let ops = 0;
  let end = reached(origin.x, origin.y) ? { x: origin.x, y: origin.y } : null;

  while (frontier.length > 0 && end === null && ops < maxOps) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    ops += 1;

    if (current.cost > (cost.get(key(current.x, current.y)) ?? Infinity)) continue;

    for (const [dx, dy] of NEIGHBOURS) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (!state.inBounds(x, y)) continue;

      const step = tileCost(x, y);
      if (step === null) continue;

      const next = current.cost + step;
      if (next > maxCost) continue;
      if (next >= (cost.get(key(x, y)) ?? Infinity)) continue;

      cost.set(key(x, y), next);
      cameFrom.set(key(x, y), current);
      if (reached(x, y)) {
        end = { x, y };
        break;
      }
      frontier.push({ x, y, cost: next });
    }
  }

  if (end === null) return { path: [], ops, cost: 0, incomplete: true };

  const path = [];
  let node = end;
  while (node.x !== origin.x || node.y !== origin.y) {
    path.unshift({ x: node.x, y: node.y });
    node = cameFrom.get(key(node.x, node.y));
    if (node === undefined) break;
  }

  return { path, ops, cost: cost.get(key(end.x, end.y)) ?? 0, incomplete: false };
}
