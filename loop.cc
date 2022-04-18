#include <ios>
#include <iostream>

#include <emscripten/bind.h>

void loop() {
  std::cout << "hello, world" << std::endl;
}

EMSCRIPTEN_BINDINGS(loop) {
  emscripten::function("loop", &loop);
}
