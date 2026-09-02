#pragma once

namespace bot {

/// Runs one tick of bot logic. Returns the tick it acted on, so that tests can
/// assert on the outcome without scraping stdout.
int loop();

/// Number of times `loop()` has been called in this WASM instance.
///
/// The WASM heap survives between ticks, which is the whole reason to run the
/// bot in C++ instead of rebuilding state every tick. This counter exists to
/// prove that persistence end to end.
int loopCount();

/// Resets the module-level state. Only tests need this; the Arena runtime gets
/// a fresh instance per match.
void reset();

}  // namespace bot
