# ライセンス選択の根拠

結論だけなら [README のライセンス節](../README.md#ライセンス)で足りる。
ここには「なぜそれを選んだか」を残す。

採用したのは **[MPL-2.0](../LICENSE)**（Mozilla Public License 2.0）。
ファイル単位のコピーレフトで、リンク形態を一切区別しない。

---

## 唯一の小さな義務

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

## なぜ LGPL ではなくこれか

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

## `template/` は別ライセンス

コピーして自分のものにする前提の雛形なので、`template/` 以下だけは
**0BSD**（[template/LICENSE](../template/LICENSE)）。帰属表示すら不要で、
MPL の通知義務もかからない。

## 免責

私は弁護士ではない。上記は MPL-2.0 の一般的な読み方であって、法的助言ではない。
気になるなら [Mozilla の FAQ](https://www.mozilla.org/MPL/2.0/FAQ/) が分かりやすい。

## Screeps: Arena について

`include/arena/constants.h` と `sim/game/constants.mjs` の定数は、
Screeps LLC が公開するゲーム Screeps: Arena の挙動を記述したもの。
クライアント同梱の typings からの転記と実機測定に基づく。
本プロジェクトは Screeps: Arena 自体に何の権利も主張せず、
Screeps LLC とは無関係である。
