#pragma once

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// SPDX-License-Identifier: MPL-2.0

// Mirror of `game/visual`.
//
// Drawing costs CPU like everything else, and a visual left in a hot loop is a
// classic way to lose ticks. Prefer `persistent = false` (the default) so the
// drawing is cleared automatically each tick.

#ifdef __EMSCRIPTEN__

#include <emscripten/val.h>

#include <optional>
#include <string>
#include <vector>

#include "arena/types.h"

namespace arena {

/// A CSS colour string, e.g. "#ff0000".
using Color = std::string;

struct CircleStyle {
  std::optional<double> radius;
  std::optional<Color> fill;
  std::optional<double> opacity;
  std::optional<Color> stroke;
  std::optional<double> strokeWidth;
  /// "dashed" or "dotted"; unset for solid.
  std::optional<std::string> lineStyle;

  emscripten::val toVal() const;
};

struct LineStyle {
  std::optional<double> width;
  std::optional<Color> color;
  std::optional<double> opacity;
  std::optional<std::string> lineStyle;

  emscripten::val toVal() const;
};

struct ShapeStyle {
  std::optional<Color> fill;
  std::optional<double> opacity;
  std::optional<Color> stroke;
  std::optional<double> strokeWidth;
  std::optional<std::string> lineStyle;

  emscripten::val toVal() const;
};

using PolyStyle = ShapeStyle;
using RectStyle = ShapeStyle;

struct TextStyle {
  /// "center", "left" or "right".
  std::optional<std::string> align;
  std::optional<Color> backgroundColor;
  std::optional<double> backgroundPadding;
  std::optional<Color> color;
  std::optional<std::string> font;
  std::optional<double> opacity;
  std::optional<Color> stroke;
  std::optional<double> strokeWidth;

  emscripten::val toVal() const;
};

/// A drawing layer. Methods chain, as they do in JS.
class Visual {
 public:
  /// @param layer       higher layers draw on top
  /// @param persistent  keep the drawing until cleared, instead of one tick
  explicit Visual(int layer = 0, bool persistent = false);

  int layer() const { return handle_["layer"].as<int>(); }
  bool persistent() const { return handle_["persistent"].as<bool>(); }

  /// Bytes this visual will send. There is a per-tick limit.
  int size() const { return handle_.call<int>("size"); }

  const Visual& clear() const;
  const Visual& circle(Position position, const CircleStyle& style = {}) const;
  const Visual& line(Position from, Position to, const LineStyle& style = {}) const;
  const Visual& poly(const std::vector<Position>& points, const PolyStyle& style = {}) const;
  const Visual& rect(Position topLeft, int width, int height, const RectStyle& style = {}) const;
  const Visual& text(const std::string& text, Position position, const TextStyle& style = {}) const;

  const emscripten::val& handle() const { return handle_; }

 private:
  emscripten::val handle_;
};

}  // namespace arena

#endif  // __EMSCRIPTEN__
