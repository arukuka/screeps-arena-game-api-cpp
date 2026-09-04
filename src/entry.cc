// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// The single symbol the Arena runtime calls, once per tick.
//
// Exported as a plain C function rather than through embind: the boundary
// carries no arguments and no return value, so embind would only add code size
// and per-call overhead. Everything interesting crosses the boundary in the
// other direction (C++ -> JS), which `src/bridge.cc` handles.
//
// `arena_add_bot()` compiles this file into the bot executable directly instead
// of pulling it from a static library, because nothing references the symbol
// and the linker would be entitled to drop it.

#include <emscripten/emscripten.h>

#include "arena/bot.h"
#include "arena/object.h"

extern "C" EMSCRIPTEN_KEEPALIVE void arena_loop() {
  // Discard last tick's snapshot before the bot can read it. Doing this here
  // rather than trusting the bot to ask means a stale world is not something
  // anyone can forget about.
  arena::detail::beginTick();

  arena::loop();
}
