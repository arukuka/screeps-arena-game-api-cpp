cmake_minimum_required(VERSION 3.25)
project(my_arena_bot CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# The library ships its C++ alongside its JS in one npm package, so the two
# halves can never be at different versions. `npm install` puts it here.
add_subdirectory(node_modules/screeps-arena-game-api-cpp arena-cpp)

if(EMSCRIPTEN)
  # Produces dist/wasm/bot.mjs, which js/main.mjs and sim/run.mjs both load.
  arena_add_bot(bot SOURCES src/bot.cc src/strategy.cc)
else()
  # Native build: the same bot source, linked against fakes instead of the
  # game, so unit tests run in about a second with no Emscripten involved.
  enable_testing()
  add_subdirectory(tests)
endif()
