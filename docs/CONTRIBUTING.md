# Working on this repository

**English** | [日本語](CONTRIBUTING.ja.md)

For changing the library itself. If you only want to write a bot, the
[README](../README.md) and [`template/`](../template/) are enough.

---

## Layout and commands

```
include/arena/   public headers
src/             the WASM bridge and the entry point
testing/         fakes for native tests (arena::testing)
cmake/           arena_add_bot() -- the public CMake API, and .clangd generation
js/              host table / WASM startup / Arena entry / rollup helper
sim/             the simulator (world model + game/* mocks + harness)
scripts/         emsdk setup and wrapper
template/        the template, and the subject of the external-consumption test
tests/           this library's own tests
```

| Command | What it runs |
|---|---|
| `npm test` | all three below |
| `npm run test:cpp` | native unit tests (no Emscripten, ~1 second) |
| `npm run test:sim` | constants cross-check + engine + WASM bridge |
| `npm run test:external` | **actually builds `template/` and verifies it** (~8 seconds) |

`test:external` is the important one. It installs an `npm pack` tarball into a
copy of `template/`, builds it with CMake, and runs it through the simulator.
It is the only thing that catches:

- a header left out of `files` in `package.json`
- broken `exports` resolution
- an `arena_add_bot()` that only works inside this repository
- a generated `dist/main.mjs` that is not pure ASCII

`template/` is **both the template and the subject of that test**, so if the
template breaks, CI goes red. The template cannot rot.

### Editors (clangd)

`.clangd` is regenerated every time `cmake --preset wasm` runs (which includes
`npm run build:fixtures` and `npm test`). It is generated, so it is gitignored.

Without it, clangd cannot read this repository. `compile_commands.json` names
`em++` as the compiler, but `em++` is a Python wrapper rather than clang, so
clangd cannot drive it and falls back to host defaults. `__EMSCRIPTEN__` ends up
undefined and `#include` resolves against the host SDK instead of the Emscripten
sysroot -- the build passes while only the editor is broken.

The generated `.clangd` closes that with two fragments.

| For | Database used | Effect |
|---|---|---|
| `include/`, `src/`, ... | `build/wasm` | supplies the flags `em++ --cflags` prints (`-target wasm32-unknown-emscripten`, `--sysroot=...`) and points at the `clang++` that em++ actually invokes |
| `tests/`, `testing/` | `build/native` | these build for the host. Separate fragments are the only way to keep the WASM flags out, because `Add:` accumulates across fragments and cannot be undone later |

The flags come from `em++ --cflags`, so bumping `.emscripten-version` cannot
leave the configuration stranded. Writing your own `.clangd` by hand takes
precedence and suppresses generation. The reasoning is in
[`cmake/ClangdConfig.cmake`](../cmake/ClangdConfig.cmake).

There are two different rules for resolving relative paths, and getting them
wrong means headers stop resolving.

| Setting | Relative to |
|---|---|
| `CompilationDatabase:` | **the directory containing `.clangd`** |
| paths inside `Compiler:` and `Add:` | **the compile command's `directory`**, i.e. the build directory |

So a fragment using `build/wasm` writes `../../` rather than `./` to reach the
repository root. The `third_party/emsdk` that `npm run setup` installs lives
inside the source tree, so the generator folds it to a relative path and no home
directory ever appears. Only an external SDK via `$EMSDK` produces an absolute
path, because a relative one cannot be written.

### CI

`.github/workflows/ci.yml` runs two jobs on push and pull request.

| Job | OS | What |
|---|---|---|
| `native` | ubuntu, macos | `npm run test:cpp`. No Emscripten, so it fails within a minute |
| `wasm` | ubuntu, macos | installs emsdk, then `test:sim` and `test:external` |

Running macOS too is deliberate. The shell scripts have to work with macOS's
**bash 3.2**, and there is nowhere else a bash 4+ feature would be noticed.

The Emscripten version has **`.emscripten-version` as its single source**; both
`scripts/setup-emsdk.sh` and the cache key read it. A CI file that wrote its own
version would drift silently sooner or later.

CI runs the same `npm run setup` a developer does, so that a broken setup script
is caught by CI rather than by the next person to clone.

---

## Adding one API

Follow the path `getTicks` took. Five places in the library:

1. **`include/arena/utils.h`** -- declare it. Keep the JS API's name
   (`getRange`, not `get_range`).
2. **`src/bridge.cc`** -- write the bridge.
   ```cpp
   int getTerrainAt(Position position) {
     return detail::api().call<int>("getTerrainAt", detail::toVal(position));
   }
   ```
3. **`js/host.mjs`** -- add it to the host table.
4. **`sim/game/utils.mjs`** -- implement it in the simulator.
5. **`testing/fake.cc`** -- add a fake, if it is a scalar API.

When adding a constant, `tests/constants.test.mjs` compares
`include/arena/constants.h` against `sim/game/constants.mjs`, so changing only
one side fails the build.

If the new API returns arrays of objects, mind the cost of crossing the
boundary. The trade-offs of the current `emscripten::val` approach, and what
switching to a snapshot design would involve, are in [DESIGN.md](DESIGN.md).

---

## Publishing the template as its own repository

```sh
git subtree split --prefix template -b template-only
git push git@github.com:arukuka/screeps-arena-cpp-template.git template-only:main
```

Then enable Settings → "Template repository" on GitHub. `template/package.json`
already depends on `github:arukuka/screeps-arena-game-api-cpp`, so `npm install`
works straight after the push.

Re-run the same two commands to publish later updates.
