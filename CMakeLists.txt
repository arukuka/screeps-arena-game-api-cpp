cmake_minimum_required(VERSION 3.25)
project(screeps_arena_bot CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ---------------------------------------------------------------------------
# Bot logic. Knows nothing about Emscripten: it talks to the game only through
# `cpp/arena/*.h`, which is what lets the native test build swap in fakes.
# ---------------------------------------------------------------------------
add_library(bot_logic STATIC
  cpp/bot/bot.cc
)
target_include_directories(bot_logic PUBLIC cpp)
target_compile_options(bot_logic PRIVATE -Wall -Wextra -Wpedantic)

if(EMSCRIPTEN)
  # -------------------------------------------------------------------------
  # WASM build: bot logic + the real JS bridge, linked into an ES module that
  # `js/main.mjs` (Arena) and `sim/` (local) both load.
  # -------------------------------------------------------------------------
  add_library(arena_api STATIC
    cpp/arena/utils_wasm.cc
  )
  target_include_directories(arena_api PUBLIC cpp)
  target_compile_options(arena_api PRIVATE -Wall -Wextra -Wpedantic)

  add_executable(bot cpp/entry/loop.cc)
  target_link_libraries(bot PRIVATE bot_logic arena_api)

  set_target_properties(bot PROPERTIES
    SUFFIX ".mjs"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/dist/wasm"
  )

  target_link_options(bot PRIVATE
    # --- shape of the generated glue ---
    -sMODULARIZE=1              # export a factory instead of touching globals
    -sEXPORT_ES6=1              # ...as an ES module, like the Arena expects
    -sEXPORT_NAME=createArenaBot
    -sENVIRONMENT=shell         # Arena's sandbox is neither browser nor Node.
                                # Keeping Node out of the build matters: the
                                # Node branch starts with `await import(...)`,
                                # which would make the factory suspend before
                                # the exports are attached. See js/runtime.mjs.

    # --- one deployable file, instantiated without awaiting ---
    -sSINGLE_FILE=1             # embed the .wasm in the .mjs
    -sSINGLE_FILE_BINARY_ENCODE=0
                                # ...as base64, not Emscripten 6's default
                                # binary-string encoding. That default is ~25%
                                # smaller but, per Emscripten's own docs, needs
                                # the file to survive transport as UTF-8. The
                                # Arena pipeline (client reads the file -> jszip
                                # -> upload -> server -> isolated-vm) makes no
                                # such promise, and a single mangled byte turns
                                # into a WebAssembly.CompileError at startup.
                                # Base64 is pure ASCII; sim/bundle.test.mjs
                                # enforces that.
    -sWASM_ASYNC_COMPILATION=0  # instantiate synchronously, so `loop()` is
                                # callable the moment the factory returns and
                                # main.mjs needs no top-level await
    -sINVOKE_RUN=0              # there is no main(); the Arena drives loop()

    # --- exported surface ---
    -sEXPORTED_FUNCTIONS=_arena_loop
    -sEXPORTED_RUNTIME_METHODS=

    # --- memory ---
    # A fixed heap keeps allocation off the per-tick CPU budget. Raise
    # INITIAL_MEMORY rather than enabling growth if the bot needs more.
    -sALLOW_MEMORY_GROWTH=0
    -sINITIAL_MEMORY=16MB
    -sSTACK_SIZE=1MB
  )

  target_link_options(bot PRIVATE
    $<$<CONFIG:Debug>:-sASSERTIONS=2 -g -O0>
    $<$<CONFIG:Release>:-sASSERTIONS=0 -O3 --closure=0>
  )
else()
  # -------------------------------------------------------------------------
  # Native build: unit tests only. No Emscripten, no Node, fast feedback.
  # -------------------------------------------------------------------------
  include(CTest)
  add_subdirectory(tests)
endif()
