# Pi extension template

[Pi coding agent](https://github.com/badlogic/pi-mono) の TypeScript extension を作るためのテンプレートです。サンプルの `/hello` コマンドは通知を表示します。

## はじめる

1. このテンプレートからリポジトリを作成し、`package.json` の `name`、`description`、`version` を変更します。必要に応じてライセンスと著作権表示も変更してください。
2. Node.js 26.13.0（LTS）と Pi を用意し、`npm ci` を実行します。nvm を使う場合は `nvm install` と `nvm use` で `.nvmrc` のバージョンを利用できます。
3. 次のコマンドで Pi を起動し、`/hello` を実行します。

   ```sh
   pi -e ./extensions/index.ts
   ```

4. `extensions/index.ts` を編集し、サンプルコマンドを実装に置き換えます。エントリーポイントを変更した場合は `package.json` の `pi.extensions` も更新してください。

### 複製後のチェックリスト

- [ ] `package.json` の名前、説明、バージョンを更新する。
- [ ] ライセンスと `LICENSE` の著作権表示を確認する。
- [ ] サンプルコマンドとテストを実装に合わせて変更する。
- [ ] README に対応・動作確認した Pi のバージョンと使い方を記載する。
- [ ] リポジトリ URL や公開設定を確認し、必要なファイルを `package.json` の `files` と `pi.extensions` に含める。
- [ ] 依存関係を変更したら `npm install` で lockfile を更新する。

## 開発

開発と CI は `.nvmrc` に記載した Node.js 26.13.0 を使います。`engines` は Pi 1.5.0 の要件に合わせて Node.js 22.19.0 以降を指定していますが、テンプレートの自動テストは 26.13.0 で実行します。

```sh
npm run typecheck
npm test
npm run check:package
```

テストは Node.js の組み込みテストランナーを使います。`tests/pi-smoke.test.ts` は Pi 本体のリソースローダーで extension を読み込み、`/hello` の登録を確認します。LLM やユーザーの Pi 設定には接続せず、一時ディレクトリを使います。サンプルコマンドを変更したら、このテストの期待値も更新してください。Pi の API やイベントについては [公式 extension ドキュメント](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) を参照してください。

### テストヘルパー

`tests/helpers/mock-pi.ts` の `createMockPi()` は、外部のテストライブラリを使わずに extension を単体テストするための部分的なモックです。

```ts
const mock = createMockPi({ confirm: [true], input: ["answer"], select: ["A"] });
extension(mock.pi);
await mock.runCommand("hello", "arguments");
assert.deepEqual(mock.notifications, [{ message: "Hello from your Pi extension!", type: "info" }]);
```

`mock.commands` と `mock.tools` から登録内容を取得できます。`mock.emit("session_start", { type: "session_start" })` は登録順にイベントハンドラーを実行し、戻り値の配列を返します。`mock.context` はハンドラーやツールを直接呼び出すときに使えます。ダイアログの回答は種類ごとに指定順で消費され、回答が不足するとエラーになります。各テストで `createMockPi()` を呼び、状態を分離してください。

このヘルパーが実装するのは登録、イベントの直接呼び出し、`notify`・`confirm`・`input`・`select` のみです。Pi のイベント伝播やツール実行、UI 全体を再現するものではありません。必要な API をテストに合わせて追加し、Pi 本体への読み込みも別途確認してください。

## インストール

GitHub に公開した後、利用者は次のようにインストールできます。

```sh
pi install git:github.com/<owner>/<repository>
```

npm に公開する場合は、パッケージ名や公開設定を確認してから公開してください。Pi パッケージの詳細は [公式ドキュメント](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md) を参照してください。

## ライセンス

MIT。詳細は [LICENSE](LICENSE) を参照してください。
