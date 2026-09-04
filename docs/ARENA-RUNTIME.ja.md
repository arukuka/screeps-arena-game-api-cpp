# Arena ランタイムとビルドフラグ

**日本語** | [English](ARENA-RUNTIME.md)

Screeps: Arena のサンドボックス (isolated-vm) について実機で分かったことと、
そこから逆算した Emscripten のリンクフラグ。

**通常は読まなくてよい。** `arena_add_bot()` が全部やる。
フラグを触る必要が出たときと、起動に失敗したときのために残してある。

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

### `Date` が存在しない

isolated-vm サンドボックスは決定性を保つため、グローバルスコープから `Date` を削除している。
しかし Emscripten のファイルシステムおよび標準入出力層（C++ で `<iostream>` やストリームを
使用した際にリンクされる）は、`Date.now()` を用いてストリームの更新時刻を記録しようとする。
そのためシムがない状態で `std::cout` を呼び出すと、次のようなランタイムエラーが発生する:

```
ReferenceError: Date is not defined
```

`js/runtime.mjs` の `ensureDate()` が、`globalThis.Date` が未定義の場合に軽量な決定論的
スタブを注入するため、`<iostream>` や `std::cout` を使ったボットも実機でクラッシュせずに
そのまま動作する。

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
- `--bind` — `emscripten::val` を使うため embind が要る。
  Arena が呼ぶ入口 (`arena_loop()`) 自体は embind を通さず
  `EMSCRIPTEN_KEEPALIVE` で出している。引数も戻り値も無いので、
  そこに embind を挟む理由が無い

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
