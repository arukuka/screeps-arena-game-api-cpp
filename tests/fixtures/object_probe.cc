// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// Checks that the snapshot returns what the handle would.
//
// The hybrid backend serves reads out of WASM memory instead of crossing into
// JavaScript. That is only worth anything if the two agree: a snapshot that is
// fast and subtly wrong is worse than no snapshot at all, because nothing
// crashes -- the bot just makes decisions on the wrong numbers.
//
// So every field is read both ways and compared, here rather than in a JS
// assertion, because only C++ can see both paths.
//
// WASM only. `tests/objects.test.mjs` drives it.

#include <cstdio>
#include <string>
#include <vector>

#include <arena/arena.h>

namespace {

int g_failures = 0;

void check(const char* field, long long viaSnapshot, long long viaHandle) {
  if (viaSnapshot == viaHandle) return;
  std::printf("MISMATCH %s: snapshot=%lld handle=%lld\n", field, viaSnapshot, viaHandle);
  ++g_failures;
}

}  // namespace

namespace arena {

void loop() {
  const std::vector<Creep> creeps = getObjectsByPrototype<Creep>();
  const std::vector<Source> sources = getObjectsByPrototype<Source>();
  const std::vector<StructureSpawn> spawns = getObjectsByPrototype<StructureSpawn>();
  const std::vector<StructureTower> towers = getObjectsByPrototype<StructureTower>();

  std::printf("counts creeps=%zu sources=%zu spawns=%zu towers=%zu\n", creeps.size(),
              sources.size(), spawns.size(), towers.size());

  for (const Creep& creep : creeps) {
    // `record() >= 0` means this object came from the snapshot; if the buffer
    // had overflowed it would be -1 and both paths would be the handle.
    if (creep.record() < 0) {
      std::printf("MISMATCH %s: not snapshotted\n", creep.id().c_str());
      ++g_failures;
      continue;
    }

    const emscripten::val& h = creep.handle();
    check("x", creep.x(), h["x"].as<int>());
    check("y", creep.y(), h["y"].as<int>());
    check("hits", creep.hits(), h["hits"].as<int>());
    check("hitsMax", creep.hitsMax(), h["hitsMax"].as<int>());
    check("my", creep.my() ? 1 : 0, h["my"].as<bool>() ? 1 : 0);
    check("fatigue", creep.fatigue(), h["fatigue"].as<int>());
    check("spawning", creep.spawning() ? 1 : 0, h["spawning"].as<bool>() ? 1 : 0);
    check("exists", creep.exists() ? 1 : 0, h["exists"].as<bool>() ? 1 : 0);
    check("store.energy", creep.store().energy(), h["store"]["energy"].as<int>());
    check("store.getCapacity", creep.store().getCapacity().value_or(-1),
          h["store"].call<int>("getCapacity", std::string("energy")));
    check("store.getUsedCapacity", creep.store().getUsedCapacity().value_or(-1),
          h["store"].call<int>("getUsedCapacity", std::string("energy")));
  }

  for (const Source& source : sources) {
    const emscripten::val& h = source.handle();
    check("source.energy", source.energy(), h["energy"].as<int>());
    check("source.energyCapacity", source.energyCapacity(), h["energyCapacity"].as<int>());
  }

  for (const StructureSpawn& spawn : spawns) {
    const emscripten::val& h = spawn.handle();
    check("spawn.hits", spawn.hits().value_or(-1), h["hits"].as<int>());
    check("spawn.my", spawn.my().value_or(false) ? 1 : 0, h["my"].as<bool>() ? 1 : 0);
    check("spawn.store.energy", spawn.store().energy(), h["store"]["energy"].as<int>());
  }

  for (const StructureTower& tower : towers) {
    check("tower.cooldown", tower.cooldown(), tower.handle()["cooldown"].as<int>());
  }

  // getObjectById() is deliberately not snapshotted; it must still read
  // correctly, through the handle.
  if (!creeps.empty()) {
    const std::optional<Creep> byId = getObjectById<Creep>(creeps.front().id());
    if (!byId.has_value()) {
      std::printf("MISMATCH getObjectById: nothing returned\n");
      ++g_failures;
    } else {
      check("byId.record is -1", byId->record(), -1);
      check("byId.hits", byId->hits(), creeps.front().hits());
    }
  }

  std::printf("mismatches %d\n", g_failures);
}

}  // namespace arena
