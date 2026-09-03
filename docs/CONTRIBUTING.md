# このリポジトリを開発する

ライブラリ自体に手を入れるときの手引き。
ボットを書くだけなら [README](../README.md) と [`template/`](../template/) で足りる。

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
根拠は [`cmake/ClangdConfig.cmake`](../cmake/ClangdConfig.cmake) に書いてある。

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

## テンプレートを別リポジトリとして公開する

```sh
git subtree split --prefix template -b template-only
git push git@github.com:arukuka/screeps-arena-cpp-template.git template-only:main
```

GitHub 側で Settings → "Template repository" を有効にする。
`template/package.json` の依存は既に
`github:arukuka/screeps-arena-game-api-cpp` を指しているので、
push 後はそのまま `npm install` できる。
