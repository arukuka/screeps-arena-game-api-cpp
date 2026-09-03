#include "arena/testing/fake.h"

#include <map>
#include <utility>

#include "arena/utils.h"

namespace {

int g_ticks = 1;
int g_getTicksCalls = 0;
double g_cpuTime = 0;

std::map<std::pair<int, int>, int>& terrain() {
  static std::map<std::pair<int, int>, int> grid;
  return grid;
}

std::map<std::pair<int, int>, int>& directions() {
  static std::map<std::pair<int, int>, int> deltas;
  return deltas;
}

}  // namespace

namespace arena {

int getTicks() {
  ++g_getTicksCalls;
  return g_ticks;
}

double getCpuTime() { return g_cpuTime; }

int getTerrainAt(Position position) {
  const auto found = terrain().find({position.x, position.y});
  return found == terrain().end() ? TERRAIN_PLAIN : found->second;
}

int getDirection(int dx, int dy) {
  const auto found = directions().find({dx, dy});
  return found == directions().end() ? 0 : found->second;
}

}  // namespace arena

namespace arena::testing {

void setTicks(int ticks) { g_ticks = ticks; }

int getTicksCallCount() { return g_getTicksCalls; }

void setCpuTime(double nanoseconds) { g_cpuTime = nanoseconds; }

void setTerrainAt(Position position, int terrainType) {
  terrain()[{position.x, position.y}] = terrainType;
}

void setDirection(int dx, int dy, int direction) {
  directions()[{dx, dy}] = direction;
}

void reset() {
  g_ticks = 1;
  g_getTicksCalls = 0;
  g_cpuTime = 0;
  terrain().clear();
  directions().clear();
}

}  // namespace arena::testing
