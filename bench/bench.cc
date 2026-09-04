// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// What the JS boundary costs.
//
// The object model hands the bot `emscripten::val` handles, so every property
// read is a round trip into JavaScript. The alternative -- copying the world
// into WASM memory once per tick and reading plain structs -- trades a fixed
// cost up front for free reads afterwards. Which is better depends entirely on
// the ratio between those two, and nobody had measured it.
//
// This runs one benchmark per tick, because the Arena bills wall-clock CPU per
// tick (`arenaInfo.cpuTimeLimit`, measured at 100 ms on Pain and Gain) and a
// single tick that tried to do all of them would be killed.
//
// Run it locally with `npm run bench`. The numbers that decide anything are the
// ones from the real game, though: see bench/README.md.

#include <arena/arena.h>
#include <emscripten/heap.h>

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <unistd.h>
#include <vector>

namespace {

using arena::Creep;

/// Keeps the optimiser from deleting the work being timed.
volatile long long g_sink = 0;

struct Result {
  const char* name;
  /// What one iteration does, for reading the ns/op column.
  const char* unit;
  long iterations;
  double totalNs;
};

std::vector<Result> g_results;



/// The five fields both scans read, so the two designs are compared on the
/// same work rather than on whatever each happens to find convenient.
constexpr int kFieldsPerCreep = 5;

/// How many creeps the scans covered, for the report.
int g_creepCount = 0;

template <typename Body>
void measure(const char* name, const char* unit, long iterations, Body body) {
  // The JS side is JIT-compiled. A bot that has been running for hundreds of
  // ticks is in a very different state from one on its first call, and the
  // steady state is the one worth reporting.
  //
  // This has to be generous. An earlier version warmed up for iterations/8 and
  // produced a table in which taking a snapshot looked 3.5x cheaper than the
  // handle scan doing the identical reads -- because the scan ran first and
  // paid V8's tier-up for those property accesses on the snapshot's behalf.
  for (long i = 0; i < iterations / 2 + 8; ++i) body();

  const double start = arena::getCpuTime();
  for (long i = 0; i < iterations; ++i) body();
  const double elapsed = arena::getCpuTime() - start;

  g_results.push_back({name, unit, iterations, elapsed});
}

double nsPerOp(const Result& result) {
  return result.iterations > 0 ? result.totalNs / static_cast<double>(result.iterations) : 0.0;
}

const Result* findResult(const char* name) {
  for (const Result& result : g_results) {
    if (result.name == name) return &result;
  }
  return nullptr;
}

void report() {
  std::printf("\n%-26s %10s %12s %12s\n", "benchmark", "iters", "total us", "ns/op");
  std::printf("%-26s %10s %12s %12s\n", "--------------------------", "----------",
              "------------", "------------");

  for (const Result& result : g_results) {
    std::printf("%-26s %10ld %12.1f %12.1f   (%s)\n", result.name, result.iterations,
                result.totalNs / 1000.0, nsPerOp(result), result.unit);
  }

  // The comparison the whole exercise exists for.
  const Result* viaHandles = findResult("scan: raw handles");
  const Result* viaSnapshot = findResult("scan: hybrid accessors");
  const Result* takeSnapshot = findResult("first pass (cold)");

  if (viaHandles != nullptr && viaSnapshot != nullptr && takeSnapshot != nullptr) {
    const double handleRead = nsPerOp(*viaHandles);
    const double snapshotRead = nsPerOp(*viaSnapshot);

    std::printf("\nreading %d creeps x %d fields:\n", g_creepCount, kFieldsPerCreep);
    std::printf("  raw handles           %10.1f ns\n", handleRead);
    std::printf("  hybrid accessors      %10.1f ns\n", snapshotRead);

    if (snapshotRead > 0) {
      std::printf("  handles are %.0fx slower\n", handleRead / snapshotRead);
    }
    std::printf("  first pass, cold      %10.1f ns  (query + wrap + columns)\n",
                nsPerOp(*takeSnapshot));

    const double budget = arena::arenaInfo().cpuTimeLimit;
    if (budget > 0) {
      std::printf("  one handle pass is %.2f%% of the %.0f ms tick budget\n",
                  100.0 * handleRead / budget, budget / 1e6);
      std::printf("  budget allows ~%.0f handle passes, or ~%.0f snapshot passes\n",
                  budget / handleRead, budget / snapshotRead);
    }

    // How many passes before the hybrid has repaid its cold start. Below 1.0
    // it is already cheaper on the very first pass.
    const double saved = handleRead - snapshotRead;
    if (saved > 0) {
      std::printf("  break-even at %.2f passes over the world\n",
                  nsPerOp(*takeSnapshot) / saved);
    }


  }

  // The three candidates side by side, since this is the open question.
  const Result* shared = findResult("fill: shared loop");
  const Result* mono = findResult("fill: per-field loops");
  const Result* record = findResult("fill: one record loop");
  if (shared != nullptr && mono != nullptr && record != nullptr) {
    const double best = std::min({nsPerOp(*shared), nsPerOp(*mono), nsPerOp(*record)});
    std::printf("\nfilling the snapshot, %d creeps:\n", g_creepCount);
    std::printf("  shared loop, 5 columns  %10.1f ns  %.2fx\n", nsPerOp(*shared),
                nsPerOp(*shared) / best);
    std::printf("  per-field, 5 columns    %10.1f ns  %.2fx\n", nsPerOp(*mono),
                nsPerOp(*mono) / best);
    std::printf("  one record loop, 9      %10.1f ns  %.2fx\n", nsPerOp(*record),
                nsPerOp(*record) / best);
  }

  std::printf("\n(sink %lld -- ignore, it exists to defeat the optimiser)\n", g_sink);
}

std::vector<Creep> creeps() { return arena::getObjectsByPrototype<Creep>(); }

/// The pre-hybrid path: five JS round trips per creep, straight off the handle.
/// Kept so the change can be measured rather than asserted.
void scanViaHandles(const std::vector<Creep>& live) {
  long long total = 0;
  for (const Creep& creep : live) {
    const emscripten::val& h = creep.handle();
    total += h["x"].as<int>();
    total += h["y"].as<int>();
    total += h["hits"].as<int>();
    total += h["hitsMax"].as<int>();
    total += h["my"].as<bool>() ? 1 : 0;
  }
  g_sink = total;
}

/// The hybrid path: the same accessors a bot writes, served from the snapshot.
void scanHybrid(const std::vector<Creep>& live) {
  long long total = 0;
  for (const Creep& creep : live) {
    total += creep.x();
    total += creep.y();
    total += creep.hits();
    total += creep.hitsMax();
    total += creep.my() ? 1 : 0;
  }
  g_sink = total;
}

/// The five fields the scans read, by the names js/host.mjs knows.
constexpr const char* kScanFields[] = {"x", "y", "hits", "hitsMax", "my"};

/// Fills those five columns by whichever host function is named, starting from
/// a cold slice. Lets one deploy compare the candidate implementations instead
/// of shipping a guess and waiting a round trip to learn it was wrong.
void fillColumns(const char* hostFunction) {
  arena::detail::beginTick();
  const std::vector<Creep> live = creeps();
  if (live.empty()) return;

  const arena::detail::Slice& slice = arena::detail::objectsByPrototype(Creep::kPrototype);
  std::vector<std::int32_t> buffer(live.size() * arena::detail::kFieldCount);
  const emscripten::val view(emscripten::typed_memory_view(buffer.size(), buffer.data()));

  for (int index = 0; index < 5; ++index) {
    arena::detail::api().call<void>(hostFunction, slice.objects,
                                    std::string(kScanFields[index]), view, index,
                                    arena::detail::kFieldCount);
  }
  g_sink = buffer[0];
}

/// The third candidate: every Creep field in one loop and one crossing.
void fillCreepRecord() {
  arena::detail::beginTick();
  const std::vector<Creep> live = creeps();
  if (live.empty()) return;

  const arena::detail::Slice& slice = arena::detail::objectsByPrototype(Creep::kPrototype);
  std::vector<std::int32_t> buffer(live.size() * arena::detail::kFieldCount);
  const emscripten::val view(emscripten::typed_memory_view(buffer.size(), buffer.data()));

  arena::detail::api().call<void>("benchSnapshotCreepFields", slice.objects, view,
                                  arena::detail::kFieldCount);
  g_sink = buffer[0];
}

/// Everything a tick pays before the first read is answered: the query, the
/// wrapping, and loading the columns those reads touch.
///
/// Columns load on first use, so timing the query alone would measure nothing.
/// `beginTick()` drops the cache so each iteration starts cold.
std::size_t coldFirstPass() {
  arena::detail::beginTick();
  const std::vector<Creep> live = creeps();
  scanHybrid(live);
  return live.size();
}


}  // namespace

namespace arena {

void loop() {
  const int tick = getTicks();

  // Iteration counts are sized so no single tick approaches cpuTimeLimit on the
  // real game: the heaviest is the handle scan, at roughly 25 ms of a 100 ms
  // budget once warm-up is included. Raise them for a quieter measurement;
  // lower them if a tick gets killed.
  switch (tick) {
    case 1: {
      // cpuTimeLimit is in nanoseconds, like getCpuTime(). The typings give no
      // unit; this was established on the real game by elimination -- the raw
      // value is 1e8, which is 100 ms as nanoseconds and absurd as anything
      // else.
      std::printf("arena: %s / %s, cpu limit %.1f ms (first tick %.1f ms)\n",
                  arenaInfo().name.c_str(), arenaInfo().season.c_str(),
                  arenaInfo().cpuTimeLimit / 1e6,
                  arenaInfo().cpuTimeLimitFirstTick / 1e6);
      g_creepCount = static_cast<int>(creeps().size());
      std::printf("creeps visible: %d\n\n", g_creepCount);

      // Timing overhead first: every other number here is two getCpuTime()
      // calls lighter than it looks, and getCpuTime() is itself a crossing.
      measure("getCpuTime()", "1 call", 1000,
              [] { g_sink = static_cast<long long>(getCpuTime()); });
      break;
    }

    case 2:
      // The floor. Pure C++, no boundary anywhere.
      measure("C++ arithmetic", "1 add", 200000, [] { g_sink = g_sink + 1; });
      break;

    case 3:
      // The cheapest crossing there is: no arguments, an integer back.
      measure("getTicks()", "1 call", 1000, [] { g_sink = getTicks(); });
      break;

    case 4: {
      const std::vector<Creep> live = creeps();
      if (live.empty()) {
        std::printf("no creeps; skipping the object benchmarks\n");
        break;
      }
      const Creep creep = live.front();
      measure("creep.hits()", "1 property", 2000, [&creep] { g_sink = creep.hits(); });
      break;
    }

    case 5: {
      // The pre-hybrid path, for comparison.
      const std::vector<Creep> live = creeps();
      measure("scan: raw handles", "1 pass", 60, [&live] { scanViaHandles(live); });
      break;
    }

    case 6: {
      // The path a bot actually writes.
      const std::vector<Creep> live = creeps();
      measure("scan: hybrid accessors", "1 pass", 2000, [&live] { scanHybrid(live); });
      break;
    }

    case 7:
      // What reads cost a tick, once: one crossing to fill the snapshot, plus
      // wrapping the objects.
      measure("first pass (cold)", "1 pass", 200,
              [] { g_sink = static_cast<long long>(coldFirstPass()); });
      break;

    case 8:
      // A second query in the same tick hits the cache.
      measure("2nd query (cached)", "1 call", 2000,
              [] { g_sink = static_cast<long long>(creeps().size()); });
      break;

    // --- how best to fill the snapshot ------------------------------------
    //
    // Three candidates, same work, measured together. The first is what the
    // library ships; the other two are alternatives that reasoning alone got
    // wrong once already.

    case 9:
      measure("fill: shared loop", "5 columns", 200,
              [] { fillColumns("snapshotField"); });
      break;

    case 10:
      measure("fill: per-field loops", "5 columns", 200,
              [] { fillColumns("benchSnapshotFieldMono"); });
      break;

    case 11:
      // Reads 9 fields rather than 5, but in one loop and one crossing.
      measure("fill: one record loop", "9 fields", 200,
              [] { fillCreepRecord(); });
      break;

    case 12: {
      // Is 16 MB enough? Report it rather than argue. `sbrk(0)` is how far the
      // allocator has grown into the heap; the gap to the total is headroom.
      const std::size_t total = emscripten_get_heap_size();
      const std::size_t used = reinterpret_cast<std::size_t>(sbrk(0));
      std::printf("\nwasm memory: %.2f MB used of %.2f MB total (%.1f%%)\n",
                  used / 1048576.0, total / 1048576.0,
                  100.0 * static_cast<double>(used) / static_cast<double>(total));
      break;
    }

    case 13:
      report();
      break;

    default:
      break;
  }
}

}  // namespace arena
