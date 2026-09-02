# Native unit tests: your bot source compiled for the host and linked against
# arena::testing, which supplies the game API from fakes. No Emscripten, no
# Node, no WASM -- about a second from edit to result.
#
# Deliberately dependency-free so `npm test` stays fast. Swap in GoogleTest or
# Catch2 via FetchContent when the assertions outgrow <cassert>.

add_executable(bot_test
  bot_test.cc
  ../src/bot.cc
)
target_compile_options(bot_test PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(bot_test PRIVATE arena::testing)

add_test(NAME bot_test COMMAND bot_test)
