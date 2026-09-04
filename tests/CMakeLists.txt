# The library's own tests.
#
# Two builds from one set of sources:
#
#   wasm   -- compiles tests/fixtures/probe_bot.cc through arena_add_bot(), the
#             same public entry point a consumer uses, and leaves the .mjs where
#             the JS tests can load it
#   native -- compiles the same fixture against arena::testing and runs it under
#             GoogleTest, with no Emscripten in sight

if(EMSCRIPTEN)
  arena_add_bot(probe_bot
    SOURCES fixtures/probe_bot.cc
    OUTPUT_DIR "${CMAKE_SOURCE_DIR}/build/fixtures"
  )
  target_include_directories(probe_bot PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")

  # Checks the snapshot against the handle it replaced. WASM only: there is no
  # object model in a native build to compare.
  arena_add_bot(object_probe
    SOURCES fixtures/object_probe.cc
    OUTPUT_DIR "${CMAKE_SOURCE_DIR}/build/fixtures"
  )

  # Comprehensive real-machine verification bot covering all Screeps Arena APIs.
  arena_add_bot(api_probe_bot
    SOURCES fixtures/api_probe_bot.cc
    OUTPUT_DIR "${CMAKE_SOURCE_DIR}/build/fixtures"
  )
  return()
endif()

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

add_executable(probe_bot_test
  probe_bot_test.cc
  fixtures/probe_bot.cc
)
target_include_directories(probe_bot_test PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_compile_options(probe_bot_test PRIVATE -Wall -Wextra -Wpedantic)
target_link_libraries(probe_bot_test PRIVATE arena::testing GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(probe_bot_test)
