#pragma once

// A deliberately boring bot, used to test the library rather than to play.
//
// It exercises the whole path -- `arena::loop()` -> `arena::getTicks()` -> the
// JS host -- and reports enough state for the native tests to assert on without
// scraping stdout.

namespace probe {

/// The tick the last `arena::loop()` acted on, or 0 before the first call.
int lastTick();

/// How many times `arena::loop()` has run in this instance.
int loopCount();

/// Clears the counters. Only tests need this.
void reset();

}  // namespace probe
