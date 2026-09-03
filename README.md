# screeps-arena-game-api-cpp

[![CI](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml/badge.svg)](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml)

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
| `<arena/utils.h>` | `game/utils` のミラー。`getObjectsByPrototype<Creep>()` など |
| `<arena/prototypes.h>` | `Creep` / `StructureSpawn` / `StructureTower` ほか全プロトタイプ |
| `<arena/constants.h>` | `game/constants` 全定数 + 実測値 |
| `<arena/types.h>` | `Position` / `getRange()` など。**JS に触れないのでネイティブでも使える** |
| `<arena/path_finder.h>` | `searchPath()` / `CostMatrix` |
| `<arena/visual.h>` | `Visual` |
| `<arena/arena.h>` | 上記すべて |
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
                       │                     src/bridge.cc         │
                       │                     val ─────────────────┼──► Module.arena.getTicks()
                       └──────────────────────────────────────────┘
```

**`js/host.mjs` の host table が唯一の接続点**であることが設計の要。
本番 (`js/arena.mjs`) は実 `game/*` を、シミュレータ (`sim/harness.mjs`) は
`sim/game/*` を同じ `createHost()` に渡す。
配線が 1 箇所しかないので、シミュレータが本番から配線ミスで乖離することがない。

C++ 側も同じ形で、`include/arena/utils.h` の宣言に対し実装が 2 つ:

- `src/bridge.cc` — `emscripten::val` 経由の本物のブリッジ (`arena::api`)
- `testing/fake.cc` — ネイティブ単体テスト用のフェイク (`arena::testing`)

### オブジェクトは `emscripten::val` ハンドル

ゲームオブジェクトは JS オブジェクトへの薄いラッパで、
**プロパティ読み取りのたびに JS 境界を越える**。そのため JS の
プロパティは C++ では**メソッド**になっている (`creep.hits()`)。
コストが呼び出し側から見えるようにするための意図的な差異。

```cpp
for (const Creep& creep : getObjectsByPrototype<Creep>()) {
  if (!creep.my()) continue;                        // 境界を越える
  if (creep.harvest(source) == ERR_NOT_IN_RANGE) {  // 境界を越える
    creep.moveTo(source.pos());
  }
}
```

Arena は tick あたりの実時間 CPU で課金される。ホットループで同じ
プロパティを何度も読むならローカルに退避すること。

### ネイティブテストで見えるもの / 見えないもの

`emscripten::val` にホスト側の等価物は無い。したがって:

| | ネイティブ | WASM |
|---|---|---|
| `constants.h` / `types.h` (`getRange` など) | ✅ | ✅ |
| `getTicks` / `getCpuTime` / `getTerrainAt` / `getDirection` | ✅ (`arena::testing` がフェイク) | ✅ |
| オブジェクトモデル全般 | ❌ | ✅ |

つまり**ゲームオブジェクトを読むコードはネイティブでテストできない。**
`template/` はこれに対する書き方を示している:

- `src/strategy.cc` — plain data 上の判断。ネイティブで 1 秒テスト
- `src/bot.cc` — ゲームを読み、strategy を呼び、行動を出すだけの薄い層

判断を strategy 側に寄せるほど、速いループでテストできる範囲が広がる。

### なぜ npm で C++ ごと配るのか

`src/bridge.cc` が呼ぶ名前と `host.mjs` のキーは一致していなければならない。
C++ と JS を別経路 (FetchContent と npm など) で取得できるようにすると、
**バージョンがずれた組み合わせが成立してしまい、誰も気づけない。**
1 パッケージ 1 バージョンにすることで、この破綻を構造的に防いでいる。

---

## API を 1 つ増やす手順

`getTicks` と同じ経路をなぞる。ライブラリ側で 5 箇所:

1. **`include/arena/utils.h`** — 宣言。名前は JS API と同一に (`getRange`, not `get_range`)
2. **`src/bridge.cc`** — ブリッジを書く
   ```cpp
   int getTerrainAt(Position position) {
     return detail::api().call<int>("getTerrainAt", detail::toVal(position));
   }
   ```
3. **`js/host.mjs`** — host table に追加
4. **`sim/game/utils.mjs`** — シミュレータ側の実装
5. **`testing/fake.cc`** — スカラー API ならフェイクを足す

定数を足すときは `tests/constants.test.mjs` が
`include/arena/constants.h` と `sim/game/constants.mjs` を突き合わせるので、
片方だけ直すとテストが落ちる。

### オブジェクトを返す API について

`getObjectsByPrototype()` のようにオブジェクト配列を返す API を
**プロパティを 1 つずつ読むのは避けたほうがいい。** Arena は tick あたりの
実時間 CPU (`arenaInfo.cpuTimeLimit`) で課金され、JS↔WASM の往復はそこに直接効く。

現状は `emscripten::val` ハンドル方式を採っている。JS API と 1:1 で読みやすい
代わりに、プロパティ 1 つにつき 1 往復する。creep 50 体を本格的に回す段階で
CPU が問題になったら、tick 頭に状態を 1 回だけ WASM のリニアメモリへ書き出す
スナップショット方式への移行を検討すること。

`sim/world.mjs` の `apiCalls` カウンタと `arena::testing::getTicksCallCount()` は、
その判断のために境界越え回数を数える道具として置いてある。

---

## 定数の扱い

`include/arena/constants.h` は **推測しない**。

- typings に値があるもの → そのまま転記
- typings に型しか無いが実機で測ったもの (`BODYPART_COST`,
  `rangedMassAttackRate`, `SPAWN_ENERGY_REGEN`, 疲労まわり) →
  **測定方法をコメントに残して**定義
- 値も測定も無いもの (`OBSTACLE_OBJECT_TYPES`, `RESOURCES_ALL`,
  `CONSTRUCTION_COST`) → **定義しない**。
  `arena::obstacleObjectTypes()` などで実機から読む

`getDirection()` も同じ理由で C++ 実装していない。Chebyshev 距離
(`getRange`) は確実なので C++ で計算するが、任意の delta を 8 方向へ
丸める規則はゲーム側の仕様であり、推測すると静かに間違った移動をする。

実測値の出所は arukuka/screeps-arena-bot `src/constants.ts`。

---

## シミュレータ

簡易エンジンを実装してある。移動 (疲労・衝突)、戦闘 (近接・遠隔・
mass attack・回復・タワー)、採掘、建設、資源の受け渡し、スポーンを解決する。

```js
const world = new World({ width: 20, height: 20 });
world.addCreep({ id: 'c1', my: true, x: 5, y: 5, body: ['move', 'work', 'carry'] });
world.addSource({ id: 's1', x: 6, y: 5, energy: 3000 });

const match = createMatch({ createArenaBot, world });
match.run(10);

assert.equal(world.creep('c1').store.energy, 20);
```

**これは近似であって実機エンジンではない。**
何が実測に基づき、何が Screeps World からの推定で、何が実装されていないかは
[`sim/FIDELITY.md`](sim/FIDELITY.md) に全部書いてある。
細部を詰める前に必ず読むこと。

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
cmake/           arena_add_bot() — 公開 CMake API と .clangd の生成
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
| `npm run test:sim` | 定数の突き合わせ + エンジン + WASM ブリッジ |
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

### エディタ (clangd)

`cmake --preset wasm` を通すたびに `.clangd` が生成される (`npm run build:fixtures`
でも `npm test` でも通る)。生成物なので `.gitignore` に入っている。

放っておくと clangd はこのリポジトリを読めない。`compile_commands.json` が
コンパイラとして `em++` を名指しするが、これは clang ではなく Python の
ラッパなので clangd は駆動できず、ホストの既定値に落ちる。結果として
`__EMSCRIPTEN__` が未定義になり、`#include` は Emscripten の sysroot ではなく
ホストの SDK に解決される。ビルドは通るのにエディタだけが壊れる、という状態になる。

生成される `.clangd` はこれを 2 つの断片で埋める。

| 対象 | 見るデータベース | 効果 |
|---|---|---|
| `include/`, `src/`, ... | `build/wasm` | `em++ --cflags` が吐くフラグ (`-target wasm32-unknown-emscripten`, `--sysroot=...`) と、em++ が実際に起動する `clang++` を指定する |
| `tests/`, `testing/` | `build/native` | こちらはホスト向けにビルドされる。WASM のフラグが混ざらないよう、断片を分けるしかない (`Add:` は断片をまたいで累積し、後から取り消せない) |

フラグの出所は `em++ --cflags` なので、`.emscripten-version` を上げても設定が
取り残されることはない。手で `.clangd` を置けばそちらが優先され、生成はされない。
根拠は [`cmake/ClangdConfig.cmake`](cmake/ClangdConfig.cmake) に書いてある。

パスの相対解決は 2 種類あり、ここを間違えるとヘッダが引けなくなる。

| 設定 | 相対パスの基準 |
|---|---|
| `CompilationDatabase:` | **`.clangd` があるディレクトリ** |
| `Compiler:`, `Add:` の中のパス | **コンパイルコマンドの `directory`** — つまりビルドディレクトリ |

なので `build/wasm` を使う設定では、リポジトリ直下を指すのに `./` ではなく
`../../` と書く。`npm run setup` で入れた `third_party/emsdk` はソースツリーの中に
あるので生成側で相対パスに畳んでおり、ホームディレクトリのパスは残らない。
`$EMSDK` で外部の SDK を使っている場合だけは絶対パスになる (相対では書けない)。

### CI

`.github/workflows/ci.yml` が push / PR で 2 ジョブを回す。

| ジョブ | OS | 内容 |
|---|---|---|
| `native` | ubuntu, macos | `npm run test:cpp`。Emscripten 不要なので 1 分以内に落ちる |
| `wasm` | ubuntu, macos | emsdk を入れて `test:sim` と `test:external` |

macOS も回すのは意図的。シェルスクリプトは macOS の **bash 3.2** で動く必要があり、
bash 4+ の機能が紛れ込んでも他に気づく場所が無い。

Emscripten のバージョンは **`.emscripten-version` が唯一の出所**で、
`scripts/setup-emsdk.sh` とキャッシュキーの両方がこれを読む。
CI が独自に版を書くと、いつか静かにずれる。

CI は開発者と同じ `npm run setup` を実行する。セットアップスクリプトが壊れたとき、
最初にクローンした人ではなく CI が気づくようにするため。

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

## 公開前に決めること

- **`LICENSE` ファイルが無い。** `package.json` には MIT と書いてあるが
  (私が置いた既定値)、実ファイルは無い。別のライセンスにするなら
  `package.json` の `license` も併せて直すこと

---

## 未計測

方式の成立自体は実機で確認済み。残っているのは性能。

- **WASM 起動の実 CPU コスト**。2000 tick 完走したので予算内には収まっているが、
  初回 tick でどれだけ使っているかは測っていない。`getCpuTime()` を生やせば分かる
- **JS↔WASM 境界 1 回あたりのコスト**。本格的な API を生やす前にここを測らないと、
  スナップショット方式へ切り替える判断ができない

---

## ライセンス

**[MPL-2.0](LICENSE)**（Mozilla Public License 2.0）。

MPL は**ファイル単位**のコピーレフト。「このプロジェクトのファイルを変更したら
そのファイルは公開、自分で書いたファイルは自由」を、リンク形態と無関係に実現する。

| やること | 義務 |
|---|---|
| このライブラリを使ってボットを書く・配布する・非公開にする | ボットのコードは**あなたのもの**。MPL は伝染しない |
| ヘッダの inline 関数・テンプレートを使う | **無し。**行数制限のような条件は存在しない |
| WASM や `main.mjs` に静的リンク・バンドルする | **無し。**MPL はリンク形態を区別しない |
| 配布物に本ライブラリのコードが含まれる | 入手元を知らせる（下記） |
| **このライブラリのファイル自体を変更して配る** | **その変更したファイルを MPL で公開** |

### 唯一の小さな義務

MPL §3.1 / §3.2(a) は、成果物を配布するとき「本ライブラリの Source Code Form の
入手方法を受領者に知らせること」を求める。上流リポジトリの URL を書けば足りる。

**`arenaBundle()` がこれを自動で出す**ので、通常は何もしなくてよい。
`dist/main.mjs` の先頭に次が入る:

```js
/*
 * This bot embeds screeps-arena-game-api-cpp, which is licensed under the
 * Mozilla Public License, v. 2.0.
 *
 * Source: https://github.com/arukuka/screeps-arena-game-api-cpp
 * Licence: https://mozilla.org/MPL/2.0/
 *
 * The bot's own code is not covered by that licence.
 */
```

ソースを自分でホストする必要も、ボットのコードを出す必要もない。
`tests/external/consume.test.mjs` がこの表記の存在を検証している。

### なぜ LGPL ではなくこれか

素の LGPL はこのプロジェクトでは意図どおりに動かない。

1. **ヘッダ主体である。** LGPLv3 §3 がヘッダ利用を免除するのは
   「10 行以下の inline 関数・テンプレート」まで。
   `getObjectsByPrototype<T>()` のようなテンプレートはそれを超える。
2. **静的リンクしかない。** 成果物は単一の WASM と単一の `main.mjs`。
   LGPLv3 §4 は改変版ライブラリで再リンクできるようにすることを求めるが、
   差し替え手段が存在しない。素直に読むとボットのオブジェクトコードか
   原文の提供義務が生じ、「利用は自由」と正反対になる。

これらを外すには自作の例外条項が要る。MPL は**そもそもこの区別を持たない**ため、
例外条項なしで同じ意図が実現できる。特許条項も入っていて、GPL 互換でもある。

### `template/` は別ライセンス

コピーして自分のものにする前提の雛形なので、`template/` 以下だけは
**0BSD**（[template/LICENSE](template/LICENSE)）。帰属表示すら不要で、
MPL の通知義務もかからない。

### 免責

私は弁護士ではない。上記は MPL-2.0 の一般的な読み方であって、法的助言ではない。
気になるなら [Mozilla の FAQ](https://www.mozilla.org/MPL/2.0/FAQ/) が分かりやすい。

### Screeps: Arena について

`include/arena/constants.h` と `sim/game/constants.mjs` の定数は、
Screeps LLC が公開するゲーム Screeps: Arena の挙動を記述したもの。
クライアント同梱の typings からの転記と実機測定に基づく。
本プロジェクトは Screeps: Arena 自体に何の権利も主張せず、
Screeps LLC とは無関係である。
