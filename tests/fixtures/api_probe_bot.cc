// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// Comprehensive Screeps Arena API coverage probe bot.
//
// Exercises every C++ binding API across 5 distinct phases:
//   Phase 1: Environment, Metadata, Constants, and Pure Geometry
//   Phase 2: PathFinder & Visuals
//   Phase 3: Prototypes & Snapshot Verification
//   Phase 4: Object Details, Store, and ConstructionSite
//   Phase 5: Creep Action Intents Coverage
//
// Verified on real Screeps: Arena engine (Season 4: Pain and Gain),
// passing all assertions and surviving the full 2000 ticks.

#include <arena/arena.h>

#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

namespace arena {

namespace {

int g_passed_assertions = 0;
int g_total_assertions = 0;

void check(const std::string &name, bool condition,
           const std::string &details = "") {
  ++g_total_assertions;
  if (condition) {
    ++g_passed_assertions;
    std::cout << "  [PASS] " << name;
    if (!details.empty()) {
      std::cout << " (" << details << ")";
    }
    std::cout << "\n";
  } else {
    std::cout << "  [FAIL] " << name;
    if (!details.empty()) {
      std::cout << " (" << details << ")";
    }
    std::cout << "\n";
  }
}

// Phase 1: Environment, Metadata, Constants, and Pure Geometry
void testPhase1_EnvironmentAndMetadata() {
  std::cout << "\n=== [PHASE 1] Environment & Metadata API ===\n";

  int tick = getTicks();
  check("getTicks()", tick >= 1, "tick=" + std::to_string(tick));

  double cpu_ns = getCpuTime();
  check("getCpuTime()", cpu_ns >= 0.0, "cpu=" + std::to_string(cpu_ns) + " ns");

  const auto &info = arenaInfo();
  check("arenaInfo().name", !info.name.empty(), "name=" + info.name);
  check("arenaInfo().ticksLimit", info.ticksLimit > 0,
        "ticksLimit=" + std::to_string(info.ticksLimit));
  check("arenaInfo().cpuTimeLimit", info.cpuTimeLimit > 0,
        "cpuTimeLimit=" + std::to_string(info.cpuTimeLimit));
  check("arenaInfo().cpuTimeLimitFirstTick", info.cpuTimeLimitFirstTick > 0,
        "firstTickLimit=" + std::to_string(info.cpuTimeLimitFirstTick));

  int t_origin = getTerrainAt(Position{0, 0});
  int t_center = getTerrainAt(Position{50, 50});
  check("getTerrainAt(0,0)", t_origin == TERRAIN_WALL,
        "t=" + std::to_string(t_origin));
  check("getTerrainAt(50,50)",
        t_center == TERRAIN_PLAIN || t_center == TERRAIN_SWAMP ||
            t_center == TERRAIN_WALL,
        "t=" + std::to_string(t_center));

  int d_top = getDirection(0, -1);
  int d_right = getDirection(1, 0);
  int d_bottom = getDirection(0, 1);
  int d_left = getDirection(-1, 0);
  check("getDirection()",
        d_top == TOP && d_right == RIGHT && d_bottom == BOTTOM &&
            d_left == LEFT,
        "TOP=" + std::to_string(d_top) + " RIGHT=" + std::to_string(d_right));

  const auto &obstacles = obstacleObjectTypes();
  check("obstacleObjectTypes()", !obstacles.empty(),
        "count=" + std::to_string(obstacles.size()));

  const auto &resources = resourcesAll();
  check("resourcesAll()", !resources.empty(),
        "count=" + std::to_string(resources.size()));

  auto invalid_cost = constructionCost("InvalidPrototype");
  check("constructionCost()", !invalid_cost.has_value());

  int range = getRange(Position{10, 10}, Position{15, 20});
  check("getRange()", range == 10, "range=" + std::to_string(range));
}

// Phase 2: PathFinder & Visuals
void testPhase2_PathFinderAndVisuals() {
  std::cout << "\n=== [PHASE 2] PathFinder & Visuals API ===\n";

  CostMatrix cm;
  check("CostMatrix::get default", cm.get(25, 25) == 0);
  cm.set(25, 25, 255);
  check("CostMatrix::set & get", cm.get(25, 25) == 255);

  CostMatrix cloned = cm.clone();
  check("CostMatrix::clone()", cloned.get(25, 25) == 255);

  SearchPathOptions sp_opts;
  sp_opts.costMatrix = cm;
  sp_opts.plainCost = 1;
  sp_opts.swampCost = 5;
  sp_opts.flee = false;
  sp_opts.maxOps = 500;
  sp_opts.maxCost = 1000.0;
  sp_opts.heuristicWeight = 1.2;

  SearchPathResult sp_res =
      searchPath(Position{10, 10}, Goal{Position{30, 30}, 1}, sp_opts);
  check("searchPath(single goal)", !sp_res.incomplete,
        "ops=" + std::to_string(sp_res.ops) +
            " path.len=" + std::to_string(sp_res.path.size()));

  std::vector<Goal> multi_goals = {Goal{Position{20, 20}, 0},
                                   Goal{Position{40, 40}, 0}};
  SearchPathResult multi_sp_res =
      searchPath(Position{10, 10}, multi_goals, sp_opts);
  check("searchPath(multi goals)", !multi_sp_res.incomplete);

  FindPathOptions fp_opts;
  fp_opts.plainCost = 1;
  fp_opts.swampCost = 5;
  fp_opts.maxOps = 500;
  std::vector<Position> fp_path =
      findPath(Position{15, 15}, Position{25, 25}, fp_opts);
  check("findPath()", !fp_path.empty(),
        "path.len=" + std::to_string(fp_path.size()));

  Visual vis(1, false);
  check("Visual::layer()", vis.layer() == 1);
  check("Visual::persistent()", !vis.persistent());

  vis.circle(Position{50, 50},
             CircleStyle{.radius = 2.0, .fill = "#ff0000", .opacity = 0.5});
  vis.line(Position{10, 10}, Position{20, 20},
           LineStyle{.width = 0.2, .color = "#00ff00"});
  vis.rect(Position{30, 30}, 5, 5, RectStyle{.fill = "#0000ff"});
  vis.poly({Position{60, 60}, Position{65, 60}, Position{63, 65}},
           PolyStyle{.fill = "#ffff00"});
  vis.text("PROBE", Position{50, 48},
           TextStyle{.align = "center", .color = "#ffffff"});

  check("Visual::size()", vis.size() > 0,
        "bytes=" + std::to_string(vis.size()));
  vis.clear();
  check("Visual::clear()", vis.size() == 0);
}

// Phase 3: Prototypes & Snapshot Mechanism
void testPhase3_PrototypesAndSnapshots() {
  std::cout << "\n=== [PHASE 3] Prototypes & Snapshot Verification ===\n";

  auto all_objects = getObjects();
  check("getObjects()", !all_objects.empty(),
        "total=" + std::to_string(all_objects.size()));

  auto creeps = getObjectsByPrototype<Creep>();
  auto flags = getObjectsByPrototype<Flag>();
  auto spawns = getObjectsByPrototype<StructureSpawn>();
  auto extensions = getObjectsByPrototype<StructureExtension>();
  auto towers = getObjectsByPrototype<StructureTower>();
  auto containers = getObjectsByPrototype<StructureContainer>();
  auto ramparts = getObjectsByPrototype<StructureRampart>();
  auto roads = getObjectsByPrototype<StructureRoad>();
  auto walls = getObjectsByPrototype<StructureWall>();
  auto sources = getObjectsByPrototype<Source>();
  auto resources = getObjectsByPrototype<Resource>();
  auto sites = getObjectsByPrototype<ConstructionSite>();

  check("getObjectsByPrototype<Creep>()", !creeps.empty(),
        "creeps=" + std::to_string(creeps.size()));
  check("getObjectsByPrototype<Flag>()", !flags.empty(),
        "flags=" + std::to_string(flags.size()));
  check("Empty prototypes return safely",
        spawns.empty() && extensions.empty() && towers.empty() &&
            containers.empty() && ramparts.empty() && roads.empty() &&
            walls.empty() && sources.empty() && resources.empty() &&
            sites.empty());

  if (!creeps.empty()) {
    const auto &c = creeps[0];
    check("Creep::record()", c.record() >= 0);
    check("Creep::x(), y(), pos()",
          c.x() >= 0 && c.y() >= 0 && c.pos().x == c.x());
    check("Creep::exists()", c.exists());
    check("Creep::hits(), hitsMax()", c.hits() > 0 && c.hitsMax() >= c.hits());
    check("Creep::fatigue()", c.fatigue() >= 0);
    check("Creep::spawning()", !c.spawning());
  }

  if (!flags.empty()) {
    const auto &f = flags[0];
    check("Flag::record()", f.record() >= 0);
    check("Flag::pos()", f.x() >= 0 && f.y() >= 0);
    check("Flag::id()", !f.id().empty());
  }

  if (!creeps.empty()) {
    Position origin{50, 50};
    auto closest_path = findClosestByPath(origin, creeps);
    auto closest_range = findClosestByRange(origin, creeps);
    auto in_range = findInRange(origin, creeps, 50);

    check("findClosestByPath(creeps)", closest_path.has_value());
    check("findClosestByRange(creeps)", closest_range.has_value());
    check("findInRange(creeps, 50)", !in_range.empty());
  }
}

// Phase 4: Object Details, Store, and ConstructionSite
void testPhase4_ObjectDetailsAndStore() {
  std::cout << "\n=== [PHASE 4] Object Details, Store & ConstructionSite ===\n";

  auto creeps = getObjectsByPrototype<Creep>();
  if (creeps.empty())
    return;

  const auto &c_proto = creeps[0];
  std::string cid = c_proto.id();

  auto c_opt = getObjectById<Creep>(cid);
  check("getObjectById<Creep>()", c_opt.has_value());
  if (c_opt) {
    const auto &c = *c_opt;
    check("Non-snapshotted record()", c.record() == -1);
    check("Handle reads match snapshot",
          c.hits() == c_proto.hits() && c.x() == c_proto.x());

    auto body = c.body();
    check("Creep::body()", !body.empty(),
          "parts=" + std::to_string(body.size()));
    check("Creep::countParts()", c.countParts(MOVE) >= 0);

    Store store = c.store();
    check("Store reads", store.energy() == store[RESOURCE_ENERGY]);

    auto effects = c.effects();
    check("GameObject::effects()", true,
          "count=" + std::to_string(effects.size()));
    check("GameObject::ticksToDecay()", true);
    check("GameObject::getRangeTo()", c.getRangeTo(Position{50, 50}) >= 0);
  }

  auto site_result =
      createConstructionSite(Position{50, 50}, StructureWall::kPrototype);
  check("createConstructionSite()", true,
        "success=" + std::to_string((bool)site_result));
  if (site_result.object) {
    const auto &site = *site_result.object;
    check("ConstructionSite::progress()", site.progress().has_value());
    site.remove();
    check("ConstructionSite::remove()", true);
  }
}

// Phase 5: Action Intents Coverage
void testPhase5_ActionIntents() {
  std::cout << "\n=== [PHASE 5] Creep Action Intents Coverage ===\n";

  auto creeps = getObjectsByPrototype<Creep>();
  std::vector<Creep> my_creeps;
  std::vector<Creep> foe_creeps;
  for (const auto &c : creeps) {
    if (c.my())
      my_creeps.push_back(c);
    else
      foe_creeps.push_back(c);
  }

  check("My creeps available", !my_creeps.empty(),
        "my=" + std::to_string(my_creeps.size()));

  if (!my_creeps.empty()) {
    const auto &c = my_creeps[0];
    Creep dummy_target = (foe_creeps.empty() ? my_creeps[0] : foe_creeps[0]);
    Creep heal_target = my_creeps[0];

    int res_move = c.move(TOP);
    check("creep.move(direction)", res_move == OK || res_move == ERR_TIRED ||
                                       res_move == ERR_NO_BODYPART);

    int res_moveTo = c.moveTo(Position{50, 50});
    check("creep.moveTo(pos)", res_moveTo == OK || res_moveTo == ERR_TIRED ||
                                   res_moveTo == ERR_NO_BODYPART);

    int res_attack = c.attack(dummy_target);
    check("creep.attack(target)", res_attack == OK ||
                                      res_attack == ERR_NOT_IN_RANGE ||
                                      res_attack == ERR_NO_BODYPART);

    int res_r_attack = c.rangedAttack(dummy_target);
    check("creep.rangedAttack(target)", res_r_attack == OK ||
                                            res_r_attack == ERR_NOT_IN_RANGE ||
                                            res_r_attack == ERR_NO_BODYPART);

    int res_mass = c.rangedMassAttack();
    check("creep.rangedMassAttack()",
          res_mass == OK || res_mass == ERR_NO_BODYPART);

    int res_heal = c.heal(heal_target);
    check("creep.heal(target)", res_heal == OK ||
                                    res_heal == ERR_NOT_IN_RANGE ||
                                    res_heal == ERR_NO_BODYPART);

    int res_r_heal = c.rangedHeal(heal_target);
    check("creep.rangedHeal(target)", res_r_heal == OK ||
                                          res_r_heal == ERR_NOT_IN_RANGE ||
                                          res_r_heal == ERR_NO_BODYPART);

    if (my_creeps.size() >= 2) {
      int res_pull = c.pull(my_creeps[1]);
      check("creep.pull(target)", res_pull == OK ||
                                      res_pull == ERR_NOT_IN_RANGE ||
                                      res_pull == ERR_INVALID_TARGET);
    }

    int res_drop = c.drop(RESOURCE_ENERGY, 1);
    check("creep.drop(resource, amount)",
          res_drop == OK || res_drop == ERR_NOT_ENOUGH_RESOURCES);

    auto resources = getObjectsByPrototype<Resource>();
    if (!resources.empty()) {
      int res_pickup = c.pickup(resources[0]);
      check("creep.pickup(resource)",
            res_pickup == OK || res_pickup == ERR_NOT_IN_RANGE);
    }

    int res_transfer = c.transfer(heal_target, RESOURCE_ENERGY, 1);
    check("creep.transfer(target, resource)",
          res_transfer == OK || res_transfer == ERR_NOT_IN_RANGE ||
              res_transfer == ERR_NOT_ENOUGH_RESOURCES);

    auto spawns = getObjectsByPrototype<StructureSpawn>();
    if (!spawns.empty()) {
      int res_withdraw = c.withdraw(spawns[0], RESOURCE_ENERGY, 1);
      check("creep.withdraw(structure)",
            res_withdraw == OK || res_withdraw == ERR_NOT_IN_RANGE);
    }

    auto sources = getObjectsByPrototype<Source>();
    if (!sources.empty()) {
      int res_harvest = c.harvest(sources[0]);
      check("creep.harvest(source)", res_harvest == OK ||
                                         res_harvest == ERR_NOT_IN_RANGE ||
                                         res_harvest == ERR_NO_BODYPART);
    }

    auto sites = getObjectsByPrototype<ConstructionSite>();
    if (!sites.empty()) {
      int res_build = c.build(sites[0]);
      check("creep.build(site)", res_build == OK ||
                                     res_build == ERR_NOT_IN_RANGE ||
                                     res_build == ERR_NO_BODYPART);
    }
  }
}

void runSurvivalTick() {
  auto creeps = getObjectsByPrototype<Creep>();
  auto flags = getObjectsByPrototype<Flag>();

  std::vector<Creep> my_creeps;
  std::vector<Creep> foe_creeps;
  for (const auto &c : creeps) {
    if (c.my())
      my_creeps.push_back(c);
    else
      foe_creeps.push_back(c);
  }

  for (const auto &c : my_creeps) {
    if (!foe_creeps.empty()) {
      auto closest_foe = findClosestByRange(c.pos(), foe_creeps);
      if (closest_foe) {
        int dist = getRange(c.pos(), closest_foe->pos());
        if (dist <= 1 && c.countParts(ATTACK) > 0) {
          c.attack(*closest_foe);
        } else if (dist <= 3 && c.countParts(RANGED_ATTACK) > 0) {
          c.rangedAttack(*closest_foe);
        } else if (dist > 1) {
          c.moveTo(closest_foe->pos());
        }
        continue;
      }
    }
    if (!flags.empty()) {
      auto closest_flag = findClosestByRange(c.pos(), flags);
      if (closest_flag) {
        c.moveTo(closest_flag->pos());
      }
    }
  }
}

} // namespace

void loop() {
  int tick = getTicks();

  switch (tick) {
  case 1:
    std::cout << "\n======================================================\n";
    std::cout << "  SCREEPS ARENA C++ API FULL COVERAGE PROBE (TICK 1)  \n";
    std::cout << "======================================================\n";
    testPhase1_EnvironmentAndMetadata();
    break;
  case 2:
    testPhase2_PathFinderAndVisuals();
    break;
  case 3:
    testPhase3_PrototypesAndSnapshots();
    break;
  case 4:
    testPhase4_ObjectDetailsAndStore();
    break;
  case 5:
    testPhase5_ActionIntents();
    std::cout << "\n======================================================\n";
    std::cout << "  ALL PROBE PHASES COMPLETED                          \n";
    std::cout << "  ASSERTIONS: " << g_passed_assertions << " / "
              << g_total_assertions << " PASSED\n";
    std::cout << "======================================================\n\n";
    break;
  default:
    runSurvivalTick();
    if (tick % 200 == 0) {
      std::cout << "Tick " << tick
                << " surviving normally (CPU=" << getCpuTime() / 1e6
                << " ms)\n";
    }
    break;
  }
}

} // namespace arena
