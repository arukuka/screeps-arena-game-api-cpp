// The single entry point the Arena runtime calls, once per tick.
//
// Exported as a plain C function rather than through embind: the boundary
// carries no arguments and no return value, so embind would only add code size
// and per-call overhead. Everything interesting crosses the boundary in the
// other direction (C++ -> JS), which `cpp/arena/` handles.

#include <emscripten/emscripten.h>

#include "bot/bot.h"

extern "C" EMSCRIPTEN_KEEPALIVE void arena_loop() { bot::loop(); }
