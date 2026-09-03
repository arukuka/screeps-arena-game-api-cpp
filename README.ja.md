# screeps-arena-game-api-cpp

**日本語** | [English](README.md)

[![CI](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml/badge.svg)](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml)

Screeps: Arena のボットを **C++ (WASM)** で書くためのライブラリ。
ローカルシミュレータと、Emscripten を知らなくても済む CMake ヘルパ付き。

> **動作確認中。** ブリッジは実機で動くことを確認済みだが、
> API 全体のアリーナごとの確認はまだ終わっていない。下記参照。

---

## 動作確認の状況

ブリッジ自体は実機で確認済み。Pain and Gain にデプロイしたボットが
**2000 tick 完走**している。

```
tick 1 (loop #1, previous 0)
tick 2 (loop #2, previous 1)
...
tick 2000 (loop #2000, previous 1999)
```

`previous` が前 tick の値を保持していることが、WASM のヒープが試合を通じて
生存している証拠。あわせて WebAssembly が使えること、16MB のヒープを
確保できることもプローブで確認している。

ただしこのボットが呼んでいたのは `getTicks()` だけである。
残りの API — `getObjectsByPrototype()`、creep や構造物の行動、経路探索、
描画 — は[近似である](sim/FIDELITY.ja.md)シミュレータでしか動かしていない。
そのため、アリーナごとに実機確認を進めている。

- [ ] Pain and Gain: Basic level
- [ ] Spawn and Swamp: Basic level
- [ ] Escort Run: Basic level
- [ ] Pain and Gain: Advanced level
- [ ] Spawn and Swamp: Advanced level
- [ ] Escort Run: Advanced level

チェックが付くまでは、そのアリーナでの挙動は「動く」ではなく「未検証」として
扱うこと。違いが見つかったら `sim/FIDELITY.ja.md` に反映する。

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

書くのは `arena::loop()` -- 毎 tick 呼ばれる 1 関数だけ。

```cpp
#include <arena/arena.h>

namespace arena {
void loop() {
  const std::vector<Source> sources = getObjectsByPrototype<Source>();

  for (const Creep& creep : getObjectsByPrototype<Creep>()) {
    if (!creep.my() || sources.empty()) continue;

    // 行動はゲームの結果コードをそのまま返すので、
    // Screeps でおなじみの書き方がそのまま通る。
    if (creep.harvest(sources[0]) == ERR_NOT_IN_RANGE) {
      creep.moveTo(sources[0].pos());
    }
  }
}
}  // namespace arena
```

テンプレートでは判断を `src/strategy.cc` に分けてある。そちらは
ゲームオブジェクトに触れないので**ネイティブで 1 秒でテストできる**
（理由は下の「ネイティブテストで見えるもの / 見えないもの」）。

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

定数は**推測していない**。typings に値が無く実機測定もできていないもの
(`OBSTACLE_OBJECT_TYPES` など) は `constants.h` に定義せず、
`arena::obstacleObjectTypes()` で実機から読む。理由は
[docs/DESIGN.ja.md](docs/DESIGN.ja.md)。

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

配布単位を 1 パッケージにしている理由、`emscripten::val` をやめる場合の
判断材料は [docs/DESIGN.ja.md](docs/DESIGN.ja.md) に書いてある。

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
[`sim/FIDELITY.ja.md`](sim/FIDELITY.ja.md) に全部書いてある。
細部を詰める前に必ず読むこと。

---

## ドキュメント

| | |
|---|---|
| [sim/FIDELITY.ja.md](sim/FIDELITY.ja.md) | **シミュレータの忠実度。**何が実測で、何が推定で、何が未実装か。細部を詰める前に読むこと |
| [docs/ARENA-RUNTIME.ja.md](docs/ARENA-RUNTIME.ja.md) | Arena サンドボックスの挙動、ビルドフラグの根拠、起動に失敗したときの読み方 |
| [docs/DESIGN.ja.md](docs/DESIGN.ja.md) | 定数の扱い、配布単位、オブジェクト表現の選択 |
| [docs/CONTRIBUTING.ja.md](docs/CONTRIBUTING.ja.md) | このリポジトリ自体を開発する |
| [docs/LICENSE-NOTES.ja.md](docs/LICENSE-NOTES.ja.md) | ライセンス選択の根拠 |

---

## 未計測

上のアリーナごとの確認とは別に、以下は一度も測っていない。

- **WASM 起動の実 CPU コスト**。2000 tick 完走したので予算内には収まっているが、
  初回 tick でどれだけ使っているかは測っていない。`getCpuTime()` を生やせば分かる
- **JS↔WASM 境界 1 回あたりのコスト**。本格的な API を生やす前にここを測らないと、
  スナップショット方式へ切り替える判断ができない

---

## ライセンス

**[MPL-2.0](LICENSE)**。`template/` 以下のみ [0BSD](template/LICENSE)。

MPL は**ファイル単位**のコピーレフトで、リンク形態を区別しない。

| やること | 義務 |
|---|---|
| ボットを書く・配布する・非公開にする | ボットのコードは**あなたのもの** |
| ヘッダの inline 関数・テンプレートを使う | **無し** |
| WASM や `main.mjs` に静的リンク・バンドルする | **無し** |
| **このライブラリのファイル自体を変更して配る** | その変更したファイルを MPL で公開 |

利用者に残る唯一の義務は「本ライブラリのソース入手先を知らせること」だが、
`arenaBundle()` が `dist/main.mjs` の先頭に自動で出すので**通常は何もしなくてよい**。

選択の根拠と免責は [docs/LICENSE-NOTES.ja.md](docs/LICENSE-NOTES.ja.md)。

Screeps: Arena は Screeps LLC のゲーム。本プロジェクトは同社と無関係で、
ゲーム自体に何の権利も主張しない。
