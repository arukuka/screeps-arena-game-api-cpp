#pragma once

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// The one function your bot must provide.
//
// The library owns the WASM entry point and calls this once per tick. It is a
// plain declaration with no definition, so forgetting to implement it is a link
// error rather than a bot that silently does nothing.

namespace arena {

/// Called once per tick, from the Arena's `loop()`.
///
/// The WASM heap lives for the whole match, so anything kept in globals or
/// function statics survives between calls. That persistence is the main reason
/// to write the bot in C++ rather than rebuild state every tick.
void loop();

}  // namespace arena
