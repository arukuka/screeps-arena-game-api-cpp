# screeps-arena-game-api-cpp

Screeps: Arena のボットを **C++ (WASM)** で書くための土台。
ローカルシミュレータ付きで、実際にデプロイしなくてもテストが回る。

現在の到達点: **C++ の `loop()` から `game/utils.getTicks()` を呼び出す**縦の一本が
実機で通っている。Season 4 (Pain and Gain) にデプロイし、**2000 tick 完走**を確認済み。

```
tick 1 (loop #1, previous 0)
tick 2 (loop #2, previous 1)
...
tick 2000 (loop #2000, previous 1999)
```

`previous` が前 tick の値を保持しているので、WASM のヒープが試合を通じて
生存していることも実機で確認できている。

---

## ビルドシステムの選択: CMake

Bazel でも CMake でも良い、という要件に対して **CMake + emsdk** を選んだ。理由:

| | CMake | Bazel |
|---|---|---|
| Emscripten 連携 | `emcmake` は Emscripten 公式が第一級でサポートする経路 | `emsdk` の Bazel ルールは事実上メンテが止まっており、旧構成が pin していた emscripten は **3.1.8 (2022年)** |
| clangd | `CMAKE_EXPORT_COMPILE_COMMANDS=ON` だけで `compile_commands.json` が出る | `bazel-compilation-database` (grailbio, 更新停止) の追加が必要だった |
| ネイティブテスト | 同じ `CMakeLists.txt` に preset を足すだけ | ツールチェーン切り替えに `--crosstool_top` (非推奨フラグ) が必要だった |
| JS 側との同居 | npm scripts がそのままタスクランナーになる | `rules_nodejs` を持ち込むことになり重い |

旧 Bazel 構成 (`WORKSPACE` / `BUILD` / `.bazelrc` / `loop.cc` ほか) は削除し、
依存はすべて現行版に更新した。

| | 旧 | 新 |
|---|---|---|
| Emscripten | 3.1.8 | **6.0.9** |
| ビルド | Bazel + emsdk rules | **CMake 3.25+ / Ninja + CMakePresets** |
| バンドラ | rollup + `rollup-plugin-terser` (deprecated) | **rollup 4** (minify なし) |
| C++ | (規定) | **C++23** |
| テスト | なし | **GoogleTest 1.17** (ネイティブ) + `node:test` (E2E) |

---

## アーキテクチャ

```
                  ┌─────────────────────────── Arena ランタイム ───┐
  毎 tick         │  import { loop } from 'main.mjs'              │
  ─────────────►  │  loop()                                       │
                  └───────────────┬───────────────────────────────┘
                                  │
                     js/main.mjs  │  game/utils を import して host table を作る
                                  ▼
                     js/host.mjs  ├── createHost({ utils })  ◄── 唯一の接続点
                                  │
                  js/runtime.mjs  │  WASM を同期的に instantiate
                                  ▼
                       ┌──────────────────── WASM ────────────────┐
                       │  arena_loop()      cpp/entry/loop.cc     │
                       │      └─ bot::loop()   cpp/bot/bot.cc     │
                       │            └─ arena::getTicks()          │
                       │                  cpp/arena/utils_wasm.cc │
                       │                  EM_JS ──────────────────┼──► Module.arena.getTicks()
                       └──────────────────────────────────────────┘
```

**`js/host.mjs` の host table が唯一の接続点**であることが設計の要。
本番 (`js/main.mjs`) は実 `game/*` を、シミュレータ (`sim/harness.mjs`) は
`sim/game/*` を同じ `createHost()` に渡す。
配線が 1 箇所しかないので、シミュレータが本番から配線ミスで乖離することがない。

C++ 側も同じ形になっている。`cpp/arena/utils.h` を宣言、実装が 2 つ:

- `cpp/arena/utils_wasm.cc` — EM_JS 経由の本物のブリッジ
- `tests/fakes/arena_fake.cc` — ネイティブ単体テスト用のフェイク

ボットのロジック (`cpp/bot/`) は Emscripten を一切知らないので、
**Emscripten も Node も無しでネイティブにコンパイルして単体テストできる。**

### ディレクトリ

```
cpp/arena/      Arena API の C++ 側ミラー (game/utils 相当)
cpp/bot/        ボットのロジック。プラットフォーム非依存
cpp/entry/      Arena が呼ぶ唯一のエクスポート arena_loop()
js/             host table / WASM 起動 / Arena エントリポイント
sim/            シミュレータ (world モデル + game/* のモック + ハーネス + E2E テスト)
tests/          ネイティブ単体テスト (GoogleTest) とフェイク
scripts/        emsdk のセットアップとラッパ
dist/wasm/      CMake の出力 (bot.mjs, 単一ファイル)
dist/main.mjs   デプロイする成果物 (rollup バンドル)
```

---

## セットアップ

```sh
npm install
npm run setup      # third_party/emsdk に Emscripten 6.0.9 を入れる (初回のみ、数分)
```

`EMSDK` が既にシェルに設定されていればそちらが優先される (`scripts/with-emsdk.sh`)。

必要なもの: Node 22+ (`node:module` の `registerHooks` を使う), CMake 3.25+, Ninja。
macOS なら `brew install cmake ninja`。

---

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run build` | WASM をビルド → `dist/wasm/bot.mjs` |
| `npm run build:debug` | assertions + DWARF 付きでビルド |
| `npm run bundle` | ビルド + rollup → `dist/main.mjs` (デプロイ成果物) |
| `npm run sim` | ビルドしてシミュレータで実行 (`-- --ticks 5` で tick 数指定) |
| `npm test` | C++ 単体テスト + シミュレータ E2E |
| `npm run test:cpp` | ネイティブ単体テストのみ (Emscripten 不要、~1 秒) |
| `npm run test:sim` | シミュレータ E2E のみ |
| `npm run deploy` | `$ARENA_DIR/main.mjs` へコピー (既定は `~/ScreepsArena/season4-pain_and_gain`) |

実行例:

```console
$ npm run sim -- --ticks 4
[t   1] tick 1 (loop #1, previous 0)
[t   2] tick 2 (loop #2, previous 1)
[t   3] tick 3 (loop #3, previous 2)
[t   4] tick 4 (loop #4, previous 3)

ran 4 tick(s); API calls: {"getTicks":4}
```

`previous` が前 tick の値になっているのは、**WASM のヒープが tick をまたいで生存している**
証拠。毎 tick 状態を作り直さなくていいことが、そもそも C++ で書く動機のひとつ。

---

## API を 1 つ増やす手順

`getTicks` と同じ経路をなぞるだけ。4 箇所を触る:

1. **`cpp/arena/utils.h`** — 宣言を足す。名前は JS API と同一に (`getRange`, not `get_range`)
2. **`cpp/arena/utils_wasm.cc`** — `EM_JS` でブリッジを書く
   ```cpp
   EM_JS(int, arena_js_getRange, (int ax, int ay, int bx, int by), {
     return Module["arena"]["getRange"]({x: ax, y: ay}, {x: bx, y: by});
   });
   ```
3. **`js/host.mjs`** — host table に追加する
4. **`sim/game/utils.mjs`** — シミュレータ側の実装を書く
5. **`tests/fakes/arena_fake.cc`** — フェイクを足す (これが無いとネイティブテストがリンクできない)

5 の「リンクが壊れる」のは意図的な安全装置で、
シミュレータとフェイクの更新忘れをビルドエラーとして検出する。

### オブジェクトを返す API について

`getObjectsByPrototype()` のようにオブジェクト配列を返す API を
**1 個ずつ EM_JS で読むのは避けたほうがいい。** Arena は tick あたりの
実時間 CPU (`arenaInfo.cpuTimeLimit`) で課金され、JS↔WASM の往復はそこに直接効く。

推奨は、tick の頭で必要な状態を **1 回だけ** WASM のリニアメモリへ書き出し、
C++ は plain struct として読み、tick の終わりに intent のリストをまとめて返す形。
`sim/world.mjs` の `apiCalls` カウンタは、この境界越え回数を数えるために置いてある。

---

## ビルドフラグの根拠

`CMakeLists.txt` の link options は、Arena ランタイムの制約から逆算して決めている。
特に次の 2 つは**変えると壊れる**ので理由を残しておく。

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

なぜ同期性にこだわるか: **`main.mjs` に top-level await を書きたくない**から。
Arena のサンドボックスが top-level await を持つエントリモジュールをどう評価するかは
こちらから検証できず、最初の数 tick を落とすボットは負ける。
副次的な利点として、この構成では生成コードに `import.meta` も現れない
(サンドボックスの互換性リスクが 1 つ減る)。

### `-sSINGLE_FILE=1` + `-sSINGLE_FILE_BINARY_ENCODE=0`

`.wasm` を `.mjs` に埋め込む。Arena は複数ファイルを受け付ける
(コード合計 10MB まで) が、単一ファイルならバイナリの扱いを一切気にしなくて済む。
現状の `dist/main.mjs` は **約 17KB**。

`SINGLE_FILE_BINARY_ENCODE=0` が重要。Emscripten 6 の既定は base64 ではなく
**独自のバイナリ文字列エンコーディング**で、約 25% 小さい代わりに
「ファイルが UTF-8 として透過的に転送されること」を要求する (Emscripten 公式ドキュメント明記)。

既定のままだと生成物は制御文字 2900 個超・非 ASCII 220 個を含む
**バイナリファイル**になる。Arena の経路 —
クライアントがファイル読込 → jszip → アップロード → サーバ → isolated-vm —
はバイト透過を保証しない。1 バイト壊れれば起動時に `WebAssembly.CompileError` が出る。

base64 なら純 ASCII。`sim/bundle.test.mjs` が `dist/main.mjs` の純 ASCII 性を
アサートしているので、この危険が再発したらテストで落ちる。

その他:

- `-sINVOKE_RUN=0` — `main()` は無く、Arena が `loop()` を駆動する
- `-sALLOW_MEMORY_GROWTH=0` / `-sINITIAL_MEMORY=16MB` — ヒープ拡張を
  tick の CPU 予算に載せない。足りなくなったら growth ではなく初期値を上げる
- **embind は使っていない** — 境界は引数も戻り値も無い `loop()` 1 本なので、
  `EMSCRIPTEN_KEEPALIVE` のほうが小さく速い。複雑な型を渡す必要が出たら再検討する
- WASM の instantiate は module scope で行う。Arena は最初の tick に
  別枠の CPU 予算 (`arenaInfo.cpuTimeLimitFirstTick`) をくれるので、そこが適所

---

## テストの二層構造

| | 対象 | 速さ | 依存 |
|---|---|---|---|
| `tests/` (GoogleTest) | C++ のロジック | ~1 秒 | なし (ネイティブ) |
| `sim/harness.test.mjs` | WASM ブリッジ + シミュレータ | ~0.1 秒 | ビルド済み WASM |
| `sim/bundle.test.mjs` | **デプロイする `dist/main.mjs` そのもの** | ~0.1 秒 | rollup バンドル |

`bundle.test.mjs` は Node の `module.registerHooks()` で `game/utils` を
シミュレータへ解決させ、実際に配布するファイルを import して動かす。
「開発時は動くがデプロイすると動かない」を潰すための層。

---

## Arena サンドボックス (isolated-vm) について分かったこと

実機のログから確定した事実。ドキュメントには書かれていない。

### WebAssembly は使える

実機プローブの結果:

```
typeof WebAssembly = object
compile an empty module: ok
reserve 256 pages (16MB): ok
```

**この方式は成立する。** WASM は存在し、コード生成も禁止されておらず、
16MB のヒープ確保も通る。実際に 2000 tick 完走している。

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
`sim/harness.test.mjs` に「`log()` だけの console」「凍結された console」の
2 ケースを置いてある (シムを外すと両方落ちることを確認済み)。

### モジュール評価中の console 出力は試合ログに出ない

tick が書いたものだけが届く。診断は必ず `loop()` から出すこと。

---

## 起動に失敗したときの読み方

`js/runtime.mjs` は**原因を推測せず、ランタイムが言ったことをそのまま出す**。
Emscripten の factory は `async` なので、instantiate 中の例外は throw ではなく
**Promise の reject** として届く。

### 診断ログは必ず tick から出す

実機で判明した重要な性質: **Arena はモジュール評価中の console 出力を
試合ログに出さない。**tick が書いたものだけが届く。

そのため `createBot()` はモジュール評価時には何も報告せず、
失敗を握っておいて**最初の tick で**まとめて出す。
ここを間違えると「何かが失敗したことだけ分かって理由が分からない」状態になる。

### 出力例

```
[wasm] instantiation failed: CompileError: WebAssembly.Module(): ...
[wasm]   typeof WebAssembly = object
[wasm]   compile an empty module: ok
[wasm]   reserve 256 pages (16MB): ok
[wasm] stack: CompileError: ...
```

1 行目が要約、続く `[wasm]   ` 付きがランタイムへのプローブ、最後がスタック。
コンソールが長い行を切っても、要約とプローブは残るこの順序にしてある。

プローブの読み方:

| 出力 | 意味 |
|---|---|
| `typeof WebAssembly = undefined` | サンドボックスに WASM が無い。この方式自体が成立しない |
| `compile an empty module:` が失敗 | WASM はあるがコード生成が embedder に禁止されている (`--jitless` 等)。8 バイトの空モジュールすら通らないので、こちらのコードの問題ではない |
| `reserve 256 pages (16MB):` が失敗 | isolate のメモリ上限。`-sINITIAL_MEMORY` を下げる |
| プローブが全部 `ok` | ランタイムは正常。1 行目のエラーがこちらの成果物の問題 |

プローブが全部 `ok` のときの 1 行目の読み方:

- `CompileError` → 埋め込みペイロードの破損。
  `npm run test:sim` の純 ASCII アサートを確認する
- `TypeError: Cannot read properties of undefined (reading 'bind')` →
  サンドボックスに欠けている console メソッドがある。
  `ensureConsoleMethods()` の `REQUIRED_CONSOLE_METHODS` に足す

起動に失敗してもモジュール評価時に例外を投げず、tick をスキップして動き続ける。
ボットとしては負けるが、**コンソールに理由が残る**ほうが診断できる。

---

## 未確認事項

実機で 2000 tick 完走したので、方式の成立自体はもう未確認事項ではない。
残っているのは性能まわり。

- **WASM 起動の実 CPU コスト**は未計測。
  2000 tick 完走したので予算内には収まっているが、初回 tick で
  どれだけ使っているかは測っていない。`getCpuTime()` を生やせば分かる。
- **JS↔WASM 境界 1 回あたりのコスト**も未計測。
  現状は tick あたり `getTicks()` の 1 回だけ。本格的な API を生やす前に
  ここを測っておかないと、スナップショット方式に切り替える判断ができない。
