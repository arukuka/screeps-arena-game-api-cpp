# my-arena-bot

Screeps: Arena のボットを C++ で書くためのテンプレート。
[screeps-arena-game-api-cpp](https://github.com/arukuka/screeps-arena-game-api-cpp) を使う。

## セットアップ

```sh
npm install
npm run setup      # Emscripten を third_party/emsdk へ (初回のみ、数分)
```

`EMSDK` を既にシェルに設定していれば `npm run setup` は不要。

必要なもの: Node 22+, CMake 3.25+, Ninja (macOS なら `brew install cmake ninja`)。

## 書く

`src/bot.cc` の `arena::loop()` が毎 tick 呼ばれる。ここだけ書けばいい。

```cpp
#include <arena/bot.h>
#include <arena/utils.h>

namespace arena {
void loop() {
  std::printf("tick %d\n", getTicks());   // printf は Arena のコンソールへ出る
}
}  // namespace arena
```

**WASM のヒープは試合を通じて生存する。** グローバルや関数 static に置いた状態は
tick をまたいで残る。毎 tick 作り直さなくていいことが、そもそも C++ で書く動機。

## 動かす

```sh
npm run sim                   # シミュレータでフル tick 実行
npm run sim -- --ticks 5      # 5 tick だけ
npm test                      # C++ 単体テスト + シミュレータ
```

## デプロイ

```sh
ARENA_DIR=~/ScreepsArena/season4-pain_and_gain npm run deploy
```

`dist/main.mjs`（WASM を base64 で埋め込んだ単一ファイル）がコピーされる。

## テストの二層構造

| | 対象 | 速さ | 依存 |
|---|---|---|---|
| `tests/bot_test.cc` | ボットのロジック | ~1 秒 | なし (ネイティブ) |
| `tests/sim.test.mjs` | コンパイル済み WASM + シミュレータ | ~0.1 秒 | ビルド済み WASM |

ネイティブテストは `arena::testing` をリンクする。**同じ `src/bot.cc` が**
本物のブリッジの代わりにフェイクの game API に繋がるので、
ボット側に一切の細工をせず Emscripten 抜きでテストできる。ここが速い開発ループ。

`arena::testing::getTicksCallCount()` で API 呼び出し回数も検証できる。
Arena は tick あたりの実時間 CPU で課金され、API 呼び出しは毎回 JS 境界を
越えるので、この回数に上限を張っておくと効く。

## レイアウト

```
src/bot.cc            あなたのボット
js/main.mjs           Arena エントリポイント (触る必要はほぼない)
sim/run.mjs           ローカル実行の CLI
tests/                ネイティブ単体テストとシミュレータテスト
CMakeLists.txt        arena_add_bot() を呼ぶだけ
```

API の増やし方・ビルドフラグの根拠・Arena サンドボックスの癖については
[ライブラリ側の README](https://github.com/arukuka/screeps-arena-game-api-cpp) を参照。
