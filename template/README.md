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

`src/bot.cc` の `arena::loop()` が毎 tick 呼ばれる。

```cpp
#include <arena/arena.h>

namespace arena {
void loop() {
  for (const Creep& creep : getObjectsByPrototype<Creep>()) {
    if (!creep.my()) continue;
    if (creep.harvest(source) == ERR_NOT_IN_RANGE) creep.moveTo(source.pos());
  }
}
}  // namespace arena
```

JS の**プロパティは C++ ではメソッド**になっている (`creep.hits()`)。
読むたびに JS 境界を越えるので、コストが呼び出し側から見えるようにしてある。

**WASM のヒープは試合を通じて生存する。** グローバルや関数 static に置いた状態は
tick をまたいで残る。毎 tick 作り直さなくていいことが、そもそも C++ で書く動機。

### なぜ src/ が 2 つに分かれているか

| ファイル | 役割 | ネイティブテスト |
|---|---|---|
| `src/strategy.cc` | plain data 上の判断 | ✅ 1 秒 |
| `src/bot.cc` | ゲームを読み、strategy を呼び、行動を出す | ❌ |

ゲームオブジェクトは `emscripten::val` で表現されており、ホスト側に等価物が無い。
つまり `Creep` を読むコードは WASM でしか動かず、ネイティブテストできない。

**判断を `strategy.cc` に寄せるほど、速いループでテストできる範囲が広がる。**
`bot.cc` は薄く保つこと。

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
| `tests/bot_test.cc` | `strategy.cc` の判断 | ~1 秒 | なし (ネイティブ) |
| `tests/sim.test.mjs` | コンパイル済み WASM + シミュレータ | ~0.1 秒 | ビルド済み WASM |

ネイティブテストは `arena::testing` をリンクする。これは `game/utils` のうち
**JS の値を持たない部分**（`getTicks` など）をフェイクで実装したもの。
`src/strategy.cc` はゲームオブジェクトに触れないので、ここで完結してテストできる。

`arena::testing::getTicksCallCount()` で API 呼び出し回数も検証できる。
Arena は tick あたりの実時間 CPU で課金され、API 呼び出しは毎回 JS 境界を
越えるので、この回数に上限を張っておくと効く。

`src/bot.cc` はゲームオブジェクトを読むためネイティブでは動かない。
そちらは `tests/sim.test.mjs` がコンパイル済み WASM ごと検証する。

## レイアウト

```
src/strategy.cc       判断（ネイティブテスト対象）
src/bot.cc            ゲームとの接続
js/main.mjs           Arena エントリポイント (触る必要はほぼない)
sim/run.mjs           ローカル実行の CLI
tests/                ネイティブ単体テストとシミュレータテスト
CMakeLists.txt        arena_add_bot() を呼ぶだけ
```

シミュレータのエンジンは**近似**である。何が実測に基づき、何が推定で、
何が未実装かは `node_modules/screeps-arena-game-api-cpp/sim/FIDELITY.md` に書いてある。
細部を詰める前に読むこと。

API の増やし方・ビルドフラグの根拠・Arena サンドボックスの癖については
[ライブラリ側の README](https://github.com/arukuka/screeps-arena-game-api-cpp) を参照。
