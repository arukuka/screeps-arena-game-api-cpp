// Native unit tests: bot sources compiled for the host and linked against
// arena::testing. No Emscripten, no Node, no WASM -- this is the fast loop a
// bot author should live in.

#include "fixtures/probe_bot.h"

#include <gtest/gtest.h>

#include "arena/bot.h"
#include "arena/testing/fake.h"

namespace {

class ProbeBot : public ::testing::Test {
 protected:
  // Both the bot and the fake keep module-level state, exactly as they do in a
  // real match. Tests get a fresh start; a match does not.
  void SetUp() override {
    arena::testing::reset();
    probe::reset();
  }
};

TEST_F(ProbeBot, ActsOnTheCurrentTick) {
  arena::testing::setTicks(42);

  arena::loop();

  EXPECT_EQ(probe::lastTick(), 42);
}

TEST_F(ProbeBot, FollowsTheTickCounter) {
  arena::testing::setTicks(7);
  arena::loop();
  EXPECT_EQ(probe::lastTick(), 7);

  arena::testing::setTicks(8);
  arena::loop();
  EXPECT_EQ(probe::lastTick(), 8);
}

TEST_F(ProbeBot, KeepsStateBetweenTicks) {
  EXPECT_EQ(probe::loopCount(), 0);

  arena::loop();
  arena::loop();
  arena::loop();

  EXPECT_EQ(probe::loopCount(), 3);
}

}  // namespace
