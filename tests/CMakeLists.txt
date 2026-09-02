# Native unit tests for the bot logic.
#
# `arena_fake.cc` provides the same symbols `cpp/arena/utils_wasm.cc` does, so
# the bot links against a fake game and runs on the host — no Emscripten, no
# Node, no WASM. Use these for logic; use `sim/*.test.mjs` for the bridge.

include(FetchContent)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.17.0
  GIT_SHALLOW    TRUE
  SYSTEM
  EXCLUDE_FROM_ALL
)
FetchContent_MakeAvailable(googletest)

# GoogleTest 1.17 is not char8_t-clean when compiled as C++23. Not our code to
# fix, and not a warning worth reading on every clean build.
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  target_compile_options(gtest PRIVATE -Wno-character-conversion)
endif()

add_executable(bot_test
  bot_test.cc
  fakes/arena_fake.cc
)
target_include_directories(bot_test PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_options(bot_test PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(bot_test PRIVATE bot_logic GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(bot_test)
