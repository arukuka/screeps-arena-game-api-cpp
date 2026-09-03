#pragma once

// Mirror of `game/path-finder`.

#ifdef __EMSCRIPTEN__

#include <emscripten/val.h>

#include <optional>
#include <vector>

#include "arena/object.h"
#include "arena/types.h"

namespace arena {

/// Custom navigation costs. A non-zero entry replaces the terrain cost.
class CostMatrix {
 public:
  /// A new matrix of zeroes.
  CostMatrix();

  /// Adopts an existing JS CostMatrix, e.g. one returned by `clone()`.
  explicit CostMatrix(emscripten::val handle) : handle_(std::move(handle)) {}

  int get(int x, int y) const { return handle_.call<int>("get", x, y); }
  void set(int x, int y, int cost) const { handle_.call<void>("set", x, y, cost); }
  CostMatrix clone() const { return CostMatrix(handle_.call<emscripten::val>("clone")); }

  const emscripten::val& handle() const { return handle_; }

 private:
  emscripten::val handle_;
};

/// A destination: a position, optionally with a range to stop short at.
struct Goal {
  Position pos;
  /// Stop once within this many squares. 0 means reach the tile itself.
  int range = 0;
};

struct SearchPathOptions {
  std::optional<CostMatrix> costMatrix;
  std::optional<int> plainCost;
  std::optional<int> swampCost;
  std::optional<bool> flee;
  std::optional<int> maxOps;
  std::optional<double> maxCost;
  std::optional<double> heuristicWeight;

  emscripten::val toVal() const;
};

struct SearchPathResult {
  std::vector<Position> path;
  /// Operations performed. Worth watching against the tick CPU budget.
  int ops = 0;
  int cost = 0;
  /// True when the search gave up before reaching a goal.
  bool incomplete = false;
};

/// An optimal path from `origin` to any of `goals`.
///
/// Unlike `findPath`, this ignores objects: only terrain and the cost matrix
/// count. Pass obstacles in through `options.costMatrix`.
SearchPathResult searchPath(Position origin, const std::vector<Goal>& goals,
                            const SearchPathOptions& options = {});

/// Single-goal convenience overload.
SearchPathResult searchPath(Position origin, Goal goal,
                            const SearchPathOptions& options = {});

}  // namespace arena

#endif  // __EMSCRIPTEN__
