#include "arena/utils.h"

#include <emscripten/em_js.h>

// The JS host table is handed to the module factory as `Module.arena`
// (see js/runtime.mjs). Bracket notation keeps the names safe if the bundle is
// ever run through a minifier that rewrites properties.
//
// EM_JS bodies are emitted inside the Emscripten module factory, so `Module` is
// in scope here.
EM_JS(int, arena_js_getTicks, (), { return Module["arena"]["getTicks"](); });

namespace arena {

int getTicks() { return arena_js_getTicks(); }

}  // namespace arena
