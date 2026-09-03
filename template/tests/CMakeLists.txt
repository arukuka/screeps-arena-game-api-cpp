# Native unit tests: your decision logic compiled for the host and linked
# against arena::testing, which supplies the scalar game API from fakes.
# No Emscripten, no Node, no WASM -- about a second from edit to result.
#
# Note what is *not* here: src/bot.cc. It reads game objects, which are built on
# emscripten::val and exist only in the WASM build. That is why the decisions
# live in strategy.cc; see src/strategy.h.
#
# Deliberately dependency-free so `npm test` stays fast. Swap in GoogleTest or
# Catch2 via FetchContent when the assertions outgrow <cassert>.

add_executable(bot_test
  bot_test.cc
  ../src/strategy.cc
)
target_include_directories(bot_test PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/../src")
target_compile_options(bot_test PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(bot_test PRIVATE arena::testing)

add_test(NAME bot_test COMMAND bot_test)
