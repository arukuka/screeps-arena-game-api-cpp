cmake_minimum_required(VERSION 3.25)
project(screeps_arena_game_api_cpp CXX)

# Consumed two ways:
#
#   * as a subdirectory of a bot project (the supported path -- see template/),
#     where only the library targets and arena_add_bot() matter
#   * standalone, when developing the library itself, which additionally builds
#     the test fixtures and the test suite
#
# PROJECT_IS_TOP_LEVEL tells the two apart, so a consumer never builds our tests.

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include("${CMAKE_CURRENT_LIST_DIR}/cmake/ArenaBot.cmake")

# Editor support. Writes .clangd next to the consumer's CMakeLists, because
# clangd cannot work out on its own what em++ does to a compile command.
include("${CMAKE_CURRENT_LIST_DIR}/cmake/ClangdConfig.cmake")
arena_write_clangd_config()

# ---------------------------------------------------------------------------
# arena::headers -- the API a bot compiles against.
# ---------------------------------------------------------------------------
add_library(arena_headers INTERFACE)
add_library(arena::headers ALIAS arena_headers)
target_include_directories(arena_headers INTERFACE "${CMAKE_CURRENT_LIST_DIR}/include")
target_compile_features(arena_headers INTERFACE cxx_std_23)

if(EMSCRIPTEN)
  # -------------------------------------------------------------------------
  # arena::api -- the real bridge. Link this to talk to the game.
  # -------------------------------------------------------------------------
  add_library(arena_api STATIC src/bridge.cc)
  add_library(arena::api ALIAS arena_api)
  target_link_libraries(arena_api PUBLIC arena::headers)
  target_compile_options(arena_api PRIVATE -Wall -Wextra -Wpedantic)
else()
  # -------------------------------------------------------------------------
  # arena::testing -- the same API backed by fakes, for native unit tests.
  # Same headers, different translation unit, so bot sources need no seams.
  # -------------------------------------------------------------------------
  add_library(arena_testing STATIC testing/fake.cc)
  add_library(arena::testing ALIAS arena_testing)
  target_link_libraries(arena_testing PUBLIC arena::headers)
  target_include_directories(arena_testing PUBLIC "${CMAKE_CURRENT_LIST_DIR}/testing/include")
  target_compile_options(arena_testing PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(PROJECT_IS_TOP_LEVEL)
  if(NOT EMSCRIPTEN)
    include(CTest)
  endif()
  add_subdirectory(tests)
endif()
