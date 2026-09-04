# screeps-arena-game-api-cpp

**日本語** | [English](README.md)

[![CI](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml/badge.svg)](https://github.com/arukuka/screeps-arena-game-api-cpp/actions/workflows/ci.yml)

Screeps: Arena のボットを **C++ (WASM)** で書くためのライブラリ。
ローカルシミュレータと、Emscripten を知らなくても済む CMake ヘルパ付き。

> **動作確認状況:** Season 4 (Pain and Gain) 実機での全 API 動作確認完了。
> 検証プローブにより 2000 tick 完走および全アサーションの通過を確認済み。他アリーナは順次確認中。下記参照。

---

## 動作確認の状況

ブリッジおよび C++ API 全体は、Screeps: Arena 実機ゲームエンジンで動作確認済み。

Pain and Gain にデプロイしたボットが **2000 tick 完走**している。

```
tick 1 (loop #1, previous 0)
tick 2 (loop #2, previous 1)
...
tick 2000 (loop #2000, previous 1999)
```

`previous` が前 tick の値を保持していることが、WASM のヒープが試合を通じて
生存している証拠。あわせて WebAssembly が使えること、16MB のヒープを
確保できることもプローブで確認している。

さらに、包括的 API 検証ボット（[`tests/fixtures/api_probe_bot.cc`](tests/fixtures/api_probe_bot.cc)）を
Season 4 (Pain and Gain) 実機へデプロイし、全 5 フェーズにわたる API 検証を実施した:
1. **環境・メタデータ**: `getTicks()`, `getCpuTime()`, `arenaInfo()`, `getTerrainAt()`, `getDirection()`, `obstacleObjectTypes()`, `resourcesAll()`, `constructionCost()`, `getRange()`
2. **PathFinder & 描画**: `CostMatrix`, `searchPath()` (単一・複数ゴール), `findPath()`, `Visual` (レイヤー、永続化、スタイル描画、クリア)
3. **プロトタイプ & スナップショット**: `getObjects()`, 各種プロトタイプの `getObjectsByPrototype<T>()`, スナップショットフィールドとハンドルの整合性、空間検索 (`findClosestByPath`, `findClosestByRange`, `findInRange`)
4. **オブジェクト詳細・Store・ConstructionSite**: `getObjectById<T>()`, `Creep::body()`, `Creep::countParts()`, `Store`, `GameObject::effects()`, `ticksToDecay()`, `createConstructionSite()`, `ConstructionSite::progress()`, `ConstructionSite::remove()`
5. **Creep アクションインテント**: `move()`, `moveTo()`, `attack()`, `rangedAttack()`, `rangedMassAttack()`, `heal()`, `rangedHeal()`, `pull()`, `drop()`, `pickup()`, `transfer()`, `withdraw()`, `harvest()`, `build()`

全 63 件のアサーションがパスし、その後も生存行動を継続して **2000 tick 完走**を確認している。
（※ Pain and Gain は戦闘特化ルールのため、Creep に Store 容量がないため `transfer()` は仕様通り `ERR_INVALID_TARGET` (-7) を返し、新規作成した `ConstructionSite` の `progress` は未着工として `std::nullopt` となりますが、これらを含めゲーム仕様通りのレスポンスが得られることを確認済み）

実機検証の実行方法:

```sh
ARENA_DIR=~/ScreepsArena/your-arena npm run probe:deploy
```

アリーナごとの確認状況:

- [x] Pain and Gain: Basic level (Season 4 実機にて api_probe_bot による全 63 アサーション通過・2000 tick 完走確認済み)
- [ ] Spawn and Swamp: Basic level
- [ ] Escort Run: Basic level
- [ ] Pain and Gain: Advanced level
- [ ] Spawn and Swamp: Advanced level
- [ ] Escort Run: Advanced level

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

### 読み取りはスナップショット、行動はハンドル

ゲームオブジェクトは JS ハンドル**と** tick ごとのスナップショットへの添字を
持つ。プロパティの読み取りは WASM メモリから返り、行動は従来どおり即時に
JavaScript へ渡るので、ゲームの結果コードがそのまま返る。

シグネチャはどちらでも同一なので、ボットは自分がどちらで動いているか
知らなくてよい。

```cpp
if (!creep.my()) continue;                        // スナップショット、約 1 ns
if (creep.harvest(src) == ERR_NOT_IN_RANGE) {     // 境界越え、結果コードあり
  creep.moveTo(src.pos());
}
```

**列は遅延読み込みする。** どれか 1 体の creep に `hits` を聞くと、
そのスライス全体の `hits` が 1 回の境界越えで埋まり、以降の読み取りは
メモリアクセスになる。誰も聞いていないフィールドは一切取りに行かない。

理由は 1 つの計測結果である。Arena のゲームオブジェクトのプロパティ読み取りは、
C++ から読んでも (境界越え込みで約 400ns)、JavaScript から読んでも
(約 230ns)、大差ない。**高いのは境界ではなく、読み取りの回数**だった。
したがって設計目標は「各フィールドを tick に高々 1 回だけ読む」
「誰も聞いていないフィールドは読まない」になる。

同じ計測が代替案も否定している。固定レコードの先読みは
スナップショットしないより悪く、フィールドごとにループを特殊化する案は
共有ループより 1.4 倍遅かった。数値と失敗した試みは
[bench/README.ja.md](bench/README.ja.md) にある。

### 行動をバッチ化しないのは意図的

バッチ化すれば creep あたり最後の境界越けも消せるが、結果コードを失う。
`if (creep.harvest(s) == ERR_NOT_IN_RANGE)` は Screeps のボットが必ず書く形で、
「答えは次の tick」の行動では成立しない。

計測はその取引が不要だと言っている。読み取りは
オブジェクト数 x フィールド数 x pass 数 だけ起きるが、行動は creep あたり
1〜2 回。読み取りを安くすればほぼ全ての利得が得られ、表現力は何も失わない。

### コスト、正直なところ

世界を 1 周する初回は、以前のハンドル方式とほぼ同じコストがかかる
（損益分岐は 1 pass 付近）。2 周目以降は約 60 分の 1 になる。
つまり各オブジェクトを 1 回しか見ないボットには中立で、
標的を評価したり、複数プランを比べたり、探索したりするボットには大きく効く。

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
測定済み: ハンドル経由のプロパティ読み取りは**実機で約 0.5 マイクロ秒**、
同じフィールドが WASM メモリにある場合は 0.24 ナノ秒。100ms の tick 予算に対し
約 20 万回の読み取りに相当する。この 0.5 マイクロ秒の約 70% は境界越えそのもの。`npm run bench` でローカル再現できる。
ボットの書き方への含意は [bench/README.ja.md](bench/README.ja.md) を参照。

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
