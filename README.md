# screeps-arena-game-api-cpp

Screeps: Arena のボットを **C++ (WASM)** で書くためのライブラリ。
ローカルシミュレータと、Emscripten を知らなくても済む CMake ヘルパ付き。

実機で動作確認済み。Season 4 (Pain and Gain) にデプロイし **2000 tick 完走**している。

```
tick 1 (loop #1, previous 0)
tick 2 (loop #2, previous 1)
...
tick 2000 (loop #2000, previous 1999)
```

`previous` が前 tick の値を保持しているので、WASM のヒープが試合を通じて
生存していることも実機で確認できている。

---

## クイックスタート

[`template/`](template/) をコピーして始めるのが早い。

```sh
cp -r template my-bot && cd my-bot
npm install
npm run setup      # Emscripten 6.0.9 を third_party/emsdk へ (初回のみ、数分)
npm test           # C++ 単体テスト + シミュレータ
npm run sim -- --ticks 5
```

書くのは `src/bot.cc` の `arena::loop()` だけ。

```cpp
#include <arena/bot.h>
#include <arena/utils.h>

namespace arena {
void loop() {
  std::printf("tick %d\n", getTicks());
}
}  // namespace arena
```

デプロイ:

```sh
ARENA_DIR=~/ScreepsArena/season4-pain_and_gain npm run deploy
```

必要なもの: Node 22+, CMake 3.25+, Ninja (macOS なら `brew install cmake ninja`)。

---

## 何を提供するか

### C++

| ヘッダ | 内容 |
|---|---|
| `<arena/bot.h>` | `arena::loop()` の**宣言のみ**。あなたが実装する。忘れるとリンクエラーになる |
| `<arena/utils.h>` | `game/utils` のミラー。現状 `arena::getTicks()` |
| `<arena/testing/fake.h>` | ネイティブ単体テスト用のフェイク制御 |

| CMake ターゲット | 用途 |
|---|---|
| `arena_add_bot(<target> SOURCES ...)` | `.mjs` を生成する。**リンクフラグはすべてここに入っている** |
| `arena::api` | 本物のブリッジ (WASM ビルド時) |
| `arena::testing` | 同じ API をフェイクで実装 (ネイティブビルド時) |

### JavaScript

| import | 内容 |
|---|---|
| `screeps-arena-game-api-cpp/arena` | `createArenaEntry()` — Arena 用エントリ。`game/*` を import するので**実機でしか読めない** |
| `screeps-arena-game-api-cpp/sim` | `createMatch()`, `World` — ローカル実行 |
| `screeps-arena-game-api-cpp/rollup` | `arenaBundle()` — rollup 設定 |
| `screeps-arena-game-api-cpp` | `createHost()`, `createBot()` — 低レベル |

利用側が書くのはこれだけ:

```js
// js/main.mjs
import { createArenaEntry } from 'screeps-arena-game-api-cpp/arena';
import createArenaBot from '../dist/wasm/bot.mjs';

export const loop = createArenaEntry(createArenaBot);
```

---

## アーキテクチャ

```
                  ┌────────────────────────── Arena ランタイム ───┐
  毎 tick         │  import { loop } from 'main.mjs'             │
  ─────────────►  │  loop()                                      │
                  └───────────────┬──────────────────────────────┘
                                  │
                    js/arena.mjs  │  game/utils を import して host table を作る
                                  ▼
                     js/host.mjs  ├── createHost({ utils })  ◄── 唯一の接続点
                                  │
                  js/runtime.mjs  │  WASM を同期的に instantiate
                                  ▼
                       ┌──────────────────── WASM ────────────────┐
                       │  arena_loop()        src/entry.cc        │
                       │      └─ arena::loop()   あなたのコード   │
                       │            └─ arena::getTicks()          │
                       │                     src/utils_wasm.cc    │
                       │                     EM_JS ───────────────┼──► Module.arena.getTicks()
                       └──────────────────────────────────────────┘
```

**`js/host.mjs` の host table が唯一の接続点**であることが設計の要。
本番 (`js/arena.mjs`) は実 `game/*` を、シミュレータ (`sim/harness.mjs`) は
`sim/game/*` を同じ `createHost()` に渡す。
配線が 1 箇所しかないので、シミュレータが本番から配線ミスで乖離することがない。

C++ 側も同じ形で、`include/arena/utils.h` の宣言に対し実装が 2 つ:

- `src/utils_wasm.cc` — EM_JS 経由の本物のブリッジ (`arena::api`)
- `testing/fake.cc` — ネイティブ単体テスト用のフェイク (`arena::testing`)

ボットのコードは Emscripten を一切知らないので、
**Emscripten も Node も無しでネイティブにコンパイルして単体テストできる。**

### なぜ npm で C++ ごと配るのか

`EM_JS` の関数名と `host.mjs` のキーは一致していなければならない。
C++ と JS を別経路 (FetchContent と npm など) で取得できるようにすると、
**バージョンがずれた組み合わせが成立してしまい、誰も気づけない。**
1 パッケージ 1 バージョンにすることで、この破綻を構造的に防いでいる。

---

## API を 1 つ増やす手順

`getTicks` と同じ経路をなぞる。ライブラリ側で 5 箇所:

1. **`include/arena/utils.h`** — 宣言。名前は JS API と同一に (`getRange`, not `get_range`)
2. **`src/utils_wasm.cc`** — `EM_JS` でブリッジを書く
   ```cpp
   EM_JS(int, arena_js_getRange, (int ax, int ay, int bx, int by), {
     return Module["arena"]["getRange"]({x: ax, y: ay}, {x: bx, y: by});
   });
   ```
3. **`js/host.mjs`** — host table に追加
4. **`sim/game/utils.mjs`** — シミュレータ側の実装
5. **`testing/fake.cc`** — フェイクを足す

5 を忘れるとネイティブテストが**リンクエラーになる**。これは意図的な安全装置で、
シミュレータとフェイクの更新忘れをビルド時に検出する。

### オブジェクトを返す API について

`getObjectsByPrototype()` のようにオブジェクト配列を返す API を
**1 個ずつ EM_JS で読むのは避けたほうがいい。** Arena は tick あたりの
実時間 CPU (`arenaInfo.cpuTimeLimit`) で課金され、JS↔WASM の往復はそこに直接効く。

推奨は、tick の頭で必要な状態を **1 回だけ** WASM のリニアメモリへ書き出し、
C++ は plain struct として読み、tick の終わりに intent のリストをまとめて返す形。
`sim/world.mjs` の `apiCalls` カウンタと `arena::testing::getTicksCallCount()` は、
この境界越え回数を数えるために置いてある。

---

## Arena サンドボックス (isolated-vm) について分かったこと

実機のログから確定した事実。公式ドキュメントには書かれていない。

### WebAssembly は使える

実機プローブの結果:

```
typeof WebAssembly = object
compile an empty module: ok
reserve 256 pages (16MB): ok
```

**この方式は成立する。** 実際に 2000 tick 完走している。

### console は `log()` しか無い

`console.error` / `console.warn` が **undefined**。
Emscripten の shell 用プリアンブルは

```js
if (globalThis.print) { console.warn ??= console.error ??= ...; }  // print が無いのでスキップ
var out = console.log.bind(console);
var err = console.error.bind(console);   // ← TypeError
```

と書かれていて、自前の補完は `globalThis.print` に依存している。
Arena は `print` を定義しないので補完が丸ごとスキップされ、`.bind` で落ちる。
しかもこれは `Module.print` / `printErr` が読まれる**前**なので、
Module 経由の指定では間に合わない。

`js/runtime.mjs` の `ensureConsoleMethods()` がインスタンス化前に欠けを埋める。
`tests/harness.test.mjs` に「`log()` だけの console」「凍結された console」の
2 ケースを置いてある (シムを外すと両方落ちることを確認済み)。

### モジュール評価中の console 出力は試合ログに出ない

tick が書いたものだけが届く。診断は必ず `loop()` から出すこと。

---

## ビルドフラグの根拠

`cmake/ArenaBot.cmake` のリンクオプションは、いずれも実機での失敗から逆算している。
特に次の 2 つは**変えると壊れる**。

### `-sENVIRONMENT=shell` (`node` を足してはいけない)

Emscripten が生成する factory は `async function` だが、
`-sWASM_ASYNC_COMPILATION=0` と組み合わせると、**最初の `await` に到達する前に**
`createWasm()` まで走り切り、エクスポートを渡したオブジェクトへ書き込む。
つまり `createArenaBot(module)` が返った直後に `module._arena_loop` が既にある。

ここに `node` を足すと、生成コードの先頭が

```js
if (ENVIRONMENT_IS_NODE) { const {createRequire} = await import("node:module"); ... }
```

になり、instantiate より先に `await` が入って同期性が壊れる。実測で確認済み。

なぜ同期性にこだわるか: **エントリに top-level await を書きたくない**から。
Arena のサンドボックスが top-level await を持つエントリモジュールをどう評価するかは
こちらから検証できず、最初の数 tick を落とすボットは負ける。
副次的な利点として、この構成では生成コードに `import.meta` も現れない。

### `-sSINGLE_FILE=1` + `-sSINGLE_FILE_BINARY_ENCODE=0`

`.wasm` を `.mjs` に埋め込む。Arena は複数ファイルを受け付ける
(コード合計 10MB まで) が、単一ファイルならバイナリの扱いを気にしなくて済む。

`SINGLE_FILE_BINARY_ENCODE=0` が重要。Emscripten 6 の既定は base64 ではなく
**独自のバイナリ文字列エンコーディング**で、約 25% 小さい代わりに
「ファイルが UTF-8 として透過的に転送されること」を要求する (公式ドキュメント明記)。

既定のままだと生成物は制御文字 2900 個超を含む**バイナリファイル**になる。
Arena の経路 — クライアントがファイル読込 → jszip → アップロード → サーバ →
isolated-vm — はバイト透過を保証しない。1 バイト壊れれば起動時に
`WebAssembly.CompileError` が出る。

base64 なら純 ASCII。`tests/external/consume.test.mjs` が
生成された `dist/main.mjs` の純 ASCII 性をアサートしている。

その他:

- `-sINVOKE_RUN=0` — `main()` は無く、Arena が `loop()` を駆動する
- `-sALLOW_MEMORY_GROWTH=0` / `-sINITIAL_MEMORY=16MB` — ヒープ拡張を
  tick の CPU 予算に載せない。足りなくなったら growth ではなく初期値を上げる
- **embind は使っていない** — 境界は引数も戻り値も無い `loop()` 1 本なので、
  `EMSCRIPTEN_KEEPALIVE` のほうが小さく速い

---

## 起動に失敗したときの読み方

`js/runtime.mjs` は**原因を推測せず、ランタイムが言ったことをそのまま出す**。
Emscripten の factory は `async` なので、instantiate 中の例外は throw ではなく
Promise の reject として届く。診断は必ず `loop()` から出す (上記の通り、
モジュール評価中の出力は試合ログに届かない)。

```
[wasm] instantiation failed: CompileError: WebAssembly.Module(): ...
[wasm]   typeof WebAssembly = object
[wasm]   compile an empty module: ok
[wasm]   reserve 256 pages (16MB): ok
[wasm] stack: CompileError: ...
```

1 行目が要約、続く `[wasm]   ` 付きがランタイムへのプローブ、最後がスタック。
コンソールが長い行を切っても要約とプローブは残るこの順序にしてある。

| プローブ出力 | 意味 |
|---|---|
| `typeof WebAssembly = undefined` | サンドボックスに WASM が無い。この方式自体が成立しない |
| `compile an empty module:` が失敗 | WASM はあるがコード生成が embedder に禁止されている。8 バイトの空モジュールすら通らないので、こちらのコードの問題ではない |
| `reserve 256 pages (16MB):` が失敗 | isolate のメモリ上限。`-sINITIAL_MEMORY` を下げる |
| 全部 `ok` | ランタイムは正常。1 行目のエラーがこちらの成果物の問題 |

全部 `ok` のときの 1 行目の読み方:

- `CompileError` → 埋め込みペイロードの破損。純 ASCII アサートを確認する
- `TypeError: Cannot read properties of undefined (reading 'bind')` →
  サンドボックスに欠けている console メソッドがある。
  `ensureConsoleMethods()` の `REQUIRED_CONSOLE_METHODS` に足す

起動に失敗してもモジュール評価時に例外を投げず、tick をスキップして動き続ける。
ボットとしては負けるが、**コンソールに理由が残る**ほうが診断できる。

---

## このリポジトリの開発

```
include/arena/   公開ヘッダ
src/             WASM ブリッジと エントリポイント
testing/         ネイティブテスト用フェイク (arena::testing)
cmake/           arena_add_bot() — 公開 CMake API
js/              host table / WASM 起動 / Arena エントリ / rollup ヘルパ
sim/             シミュレータ (world モデル + game/* のモック + ハーネス)
scripts/         emsdk のセットアップとラッパ
template/        テンプレート 兼 外部利用テストの対象
tests/           このライブラリ自身のテスト
```

| コマンド | 内容 |
|---|---|
| `npm test` | 下記 3 つすべて |
| `npm run test:cpp` | ネイティブ単体テスト (Emscripten 不要、~1 秒) |
| `npm run test:sim` | WASM ブリッジ + シミュレータ |
| `npm run test:external` | **`template/` を実際にビルドして検証** (~8 秒) |

`test:external` が要。`npm pack` した tarball を `template/` のコピーへ
install し、CMake でビルドしてシミュレータまで走らせる。
これだけが検出できるもの:

- `package.json` の `files` にヘッダを入れ忘れた
- `exports` の解決が壊れた
- `arena_add_bot()` がこのリポジトリの中でしか動かない
- 生成された `dist/main.mjs` が純 ASCII でない

`template/` は**テンプレートであると同時にこのテストの対象**なので、
テンプレートが壊れたら CI が落ちる。テンプレートが腐らない。

---

## テンプレートを別リポジトリとして公開する

```sh
git subtree split --prefix template -b template-only
git push git@github.com:arukuka/screeps-arena-cpp-template.git template-only:main
```

GitHub 側で Settings → "Template repository" を有効にする。
`template/package.json` の依存は既に
`github:arukuka/screeps-arena-game-api-cpp` を指しているので、
push 後はそのまま `npm install` できる。

---

## 未計測

方式の成立自体は実機で確認済み。残っているのは性能。

- **WASM 起動の実 CPU コスト**。2000 tick 完走したので予算内には収まっているが、
  初回 tick でどれだけ使っているかは測っていない。`getCpuTime()` を生やせば分かる
- **JS↔WASM 境界 1 回あたりのコスト**。本格的な API を生やす前にここを測らないと、
  スナップショット方式へ切り替える判断ができない
