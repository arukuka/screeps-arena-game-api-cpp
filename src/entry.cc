// The single symbol the Arena runtime calls, once per tick.
//
// Exported as a plain C function rather than through embind: the boundary
// carries no arguments and no return value, so embind would only add code size
// and per-call overhead. Everything interesting crosses the boundary in the
// other direction (C++ -> JS), which `src/utils_wasm.cc` handles.
//
// `arena_add_bot()` compiles this file into the bot executable directly instead
// of pulling it from a static library, because nothing references the symbol
// and the linker would be entitled to drop it.

#include <emscripten/emscripten.h>

#include "arena/bot.h"

extern "C" EMSCRIPTEN_KEEPALIVE void arena_loop() { arena::loop(); }
