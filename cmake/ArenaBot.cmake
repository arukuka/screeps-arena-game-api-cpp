# Public CMake API for building a Screeps: Arena bot.
#
#   arena_add_bot(<target> SOURCES <files...> [OUTPUT_DIR <dir>])
#
# Produces `<OUTPUT_DIR>/<target>.mjs`: a single self-contained ES module that
# `js/arena.mjs` loads on the Arena and `sim/` loads locally.
#
# Every link option below was derived from a failure on the real Arena. The
# comments say which. Do not drop one without reading them.

set(ARENA_CPP_ENTRY_SOURCE "${CMAKE_CURRENT_LIST_DIR}/../src/entry.cc"
    CACHE INTERNAL "Path to the library's WASM entry point")

function(arena_add_bot target)
  cmake_parse_arguments(PARSE_ARGV 1 ARG "" "OUTPUT_DIR" "SOURCES")

  if(NOT ARG_SOURCES)
    message(FATAL_ERROR "arena_add_bot(${target}): SOURCES is required")
  endif()
  if(NOT EMSCRIPTEN)
    message(FATAL_ERROR
      "arena_add_bot(${target}) needs the Emscripten toolchain. Configure with "
      "the 'wasm' preset; native builds are for unit tests and should link "
      "arena::testing instead.")
  endif()
  if(NOT ARG_OUTPUT_DIR)
    set(ARG_OUTPUT_DIR "${CMAKE_SOURCE_DIR}/dist/wasm")
  endif()

  # The entry point is compiled into the executable rather than pulled from a
  # static library: nothing references `arena_loop`, so the linker would be
  # entitled to drop the object it lives in.
  add_executable(${target} ${ARG_SOURCES} "${ARENA_CPP_ENTRY_SOURCE}")
  target_link_libraries(${target} PRIVATE arena::api)

  set_target_properties(${target} PROPERTIES
    SUFFIX ".mjs"
    RUNTIME_OUTPUT_DIRECTORY "${ARG_OUTPUT_DIR}"
  )

  target_link_options(${target} PRIVATE
    # --- embind, for emscripten::val ---
    # The game object model holds JS handles, so the bot needs val at runtime.
    --bind

    # --- shape of the generated glue ---
    -sMODULARIZE=1              # export a factory instead of touching globals
    -sEXPORT_ES6=1              # ...as an ES module, like the Arena expects
    -sEXPORT_NAME=createArenaBot
    -sENVIRONMENT=shell         # The Arena's sandbox is neither browser nor
                                # Node. Keeping Node out of the build matters:
                                # the Node branch opens with `await import(...)`,
                                # which would make the factory suspend before
                                # the exports are attached. js/runtime.mjs
                                # depends on that not happening.

    # --- one deployable file, instantiated without awaiting ---
    -sSINGLE_FILE=1             # embed the .wasm in the .mjs
    -sSINGLE_FILE_BINARY_ENCODE=0
                                # ...as base64, not Emscripten 6's default
                                # binary-string encoding. That default needs the
                                # file to survive transport as UTF-8, which the
                                # Arena pipeline (client -> jszip -> upload ->
                                # server) does not promise. One mangled byte is
                                # a WebAssembly.CompileError at startup.
    -sWASM_ASYNC_COMPILATION=0  # instantiate synchronously, so the bot is
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

  target_link_options(${target} PRIVATE
    $<$<CONFIG:Debug>:-sASSERTIONS=2 -g -O0>
    $<$<CONFIG:Release>:-sASSERTIONS=0 -O3 --closure=0>
  )
endfunction()
