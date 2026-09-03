# シミュレータの忠実度

**日本語** | [English](FIDELITY.md)

このシミュレータは **近似** である。実機の Screeps: Arena エンジンではない。

ここに書いてあるのは「実機と違うと分かっていること」と「根拠のレベル」。
**ここに書かれていない挙動は「検証済み」ではなく「未検証」**である。
両者はまったく違う。

---

## 根拠のレベル

| 記号 | 意味 |
|---|---|
| **実測** | 実機で測定した。方法が `include/arena/constants.h` に残っている |
| **典拠** | vendoring した typings に値が書かれている |
| **推定** | Screeps World の規則をそのまま当てた。**実機で確認していない** |
| **未実装** | そもそも実装していない |

---

## 実測に基づくもの

これらは arukuka/screeps-arena-bot で実機測定された値に基づく。

| 規則 | 値 | 備考 |
|---|---|---|
| body part コスト | move/carry 50, tough 10, attack 80, work 100, ranged_attack 150, heal 250 | 単体 part の creep を生産し総エネルギー差分から算出 |
| `rangedAttack` の距離減衰 | **無し** | 距離 1〜3 のどこでも `10 x パーツ数` |
| `rangedMassAttack` の距離減衰 | 距離 1/2/3 で 1 / 0.4 / 0.1 | 距離 0 は観測不能（敵と同じマスに立てない） |
| Spawn のエネルギー自動回復 | 1 / tick、`SPAWN_ENERGY_CAPACITY` で頭打ち | typings にも公式ドキュメントにも定数が無い |
| 移動疲労 | 入るマスにつき `2 x 非 move パーツ数 x 地形係数`、tick 頭に `2 x move パーツ数` 回復 | **疲労は「入るマス」で決まる。出るマスではない** |
| 地形係数 | plain 1 / swamp 5 | road は未実測 |
| `arenaInfo` の CPU 上限 | `cpuTimeLimit` 1e8 ns (100ms)、`cpuTimeLimitFirstTick` 1e9 ns (1 秒) | typings に単位の記載が無い。他の解釈はいずれも非現実的なので消去法で確定 |

---

## 推定（実機未確認）

**ここが一番危ない。** 実機と違う可能性がある。

### タワーの距離減衰

`TOWER_OPTIMAL_RANGE` / `TOWER_FALLOFF_RANGE` / `TOWER_FALLOFF` が
Screeps World と同名で定義されているため、World の式をそのまま当てている。

```
distance <= OPTIMAL          -> 威力そのまま
distance >  OPTIMAL          -> 威力 x (1 - FALLOFF x (min(d, FALLOFF_RANGE) - OPTIMAL) / (FALLOFF_RANGE - OPTIMAL))
```

3 つの定数が明らかに何かを意味している以上、無視するよりは実装したほうがよい
という判断。`tests/engine.test.mjs` に距離 10 での期待値を固定してあるので、
実測したらそこが落ちる。

### road の移動係数

road は未実測。エンジンは road 上を疲労 0 として扱っているが、
World の 0.5 が正しい可能性が高い。**road のあるアリーナでは信用しないこと。**

### `OBSTACLE_OBJECT_TYPES` / `CONSTRUCTION_COST`

typings は型のみで値が無い。`sim/game/constants.mjs` の値は
このエンジンが仮定しているものであって、ゲームの仕様の主張ではない。

ボットからは `arena::obstacleObjectTypes()` / `arena::constructionCost()` で
**実機の値を読むこと**。`include/arena/constants.h` はここを推測しない。

---

## 実機と異なると分かっているもの

| 項目 | 実機 | ここ |
|---|---|---|
| `spawnCreep()` の戻り値 | 生成される `Creep` を即座に返す | `{}` を返す。creep はエンジンが intent を適用する時に生成される |
| 建設完了 | 完成した構造物が出現する | 建設現場が消えるだけ。**どのプロトタイプを建てるかはアリーナ依存で、推測すると害になる** |
| 移動の競合 | エンジン内部の優先規則がある | 同じマスを望んだ creep は**全員その場に留まる** |
| `moveTo()` の経路 | `findPath` 相当の経路探索 | 貪欲な 1 歩（直線 → 軸を 1 つ緩める）。経路が重要なら `searchPath` を使うこと |
| `searchPath` | 重み付き A* | Dijkstra。コストと到達可能性は一致するが `ops` の値と同コスト経路のタイブレークは違う |
| `getCpuTime()` | 実機の tick 内経過時間 | Node の実時間。値の意味は近いが同じではない |
| 効果 (`effects`) | ブースト・修飾子が実際に効く | 保持するだけ。**計算に反映していない** |

---

## 未実装

- 資源の減衰（`RESOURCE_DECAY`）
- road の摩耗（`ROAD_WEAROUT`）
- `pull`（intent は記録されるが解決しない）
- `dismantle` / `repair`
- ランパートによる被弾の肩代わり
- 勝敗判定（アリーナ固有のため）

---

## 使い方の指針

シミュレータが向いているのは:

- ブリッジが動いているかの確認（C++ が本当に `game/*` に届いているか）
- ボットの**判断**の検証（「敵が近ければ後退する」など）
- 回帰テスト

向いていないのは:

- 戦術の**細かい**詰め（1 ダメージ単位の最適化）
- 実機の勝敗予測
- パラメータの自動チューニング（ここに最適化すると実機からずれる）

細部を詰めたいなら実機で測り、その結果をここに反映して、
`tests/engine.test.mjs` に固定すること。
