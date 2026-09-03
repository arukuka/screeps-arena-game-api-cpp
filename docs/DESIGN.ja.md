# 設計上の判断

**日本語** | [English](DESIGN.md)

なぜこうなっているか。利用するだけなら読まなくてよいが、
不満が出たときに「なぜそうしなかったのか」がここに書いてある。

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

## 配布単位

### なぜ npm で C++ ごと配るのか

`src/bridge.cc` が呼ぶ名前と `host.mjs` のキーは一致していなければならない。
C++ と JS を別経路 (FetchContent と npm など) で取得できるようにすると、
**バージョンがずれた組み合わせが成立してしまい、誰も気づけない。**
1 パッケージ 1 バージョンにすることで、この破綻を構造的に防いでいる。

---

## オブジェクト表現

現状は `emscripten::val` ハンドル方式。JS API と 1:1 で読みやすい代わりに、
プロパティ 1 つにつき JS 境界を 1 往復する。

Arena は tick あたりの実時間 CPU (`arenaInfo.cpuTimeLimit`) で課金されるため、
creep 50 体を本格的に回す段階で CPU が問題になったら、tick 頭に状態を
**1 回だけ** WASM のリニアメモリへ書き出すスナップショット方式への移行を
検討すること。

`sim/world.mjs` の `apiCalls` カウンタと `arena::testing::getTicksCallCount()` は
境界越えの回数を数える道具で、1 回のコストは `bench/` で測ってある。
Pain and Gain での数値は、ハンドル経由のプロパティ読み取りが約 1.8 マイクロ秒、
同じフィールドが WASM メモリにあれば 0.45 ナノ秒、tick 予算は 100ms。
注目すべきは、サンドボックスが**境界越えの回数**に課金している点で、
一括の `getObjectsByPrototype()` は Node と変わらない。

移行するとオブジェクトのプロパティは struct のフィールドになり、
行動の戻り値をその tick で得られなくなる (`ERR_NOT_IN_RANGE` を見て分岐する
書き方ができなくなる) ため、API の形が変わる。安くはない。
