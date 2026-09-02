#include "bot/bot.h"

#include <gtest/gtest.h>

#include "fakes/arena_fake.h"

namespace {

class BotLoop : public ::testing::Test {
 protected:
  // Both the bot and the fake keep module-level state, exactly as they do in a
  // real match. Tests get a fresh start; a match does not.
  void SetUp() override {
    arena::testing::reset();
    bot::reset();
  }
};

TEST_F(BotLoop, ActsOnTheCurrentTick) {
  arena::testing::setTicks(42);

  EXPECT_EQ(bot::loop(), 42);
}

TEST_F(BotLoop, FollowsTheTickCounter) {
  arena::testing::setTicks(7);
  EXPECT_EQ(bot::loop(), 7);

  arena::testing::setTicks(8);
  EXPECT_EQ(bot::loop(), 8);
}

TEST_F(BotLoop, KeepsStateBetweenTicks) {
  EXPECT_EQ(bot::loopCount(), 0);

  bot::loop();
  bot::loop();
  bot::loop();

  EXPECT_EQ(bot::loopCount(), 3);
}

}  // namespace
