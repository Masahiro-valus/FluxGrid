# FluxGrid

FluxGrid は Cursor/VS Code 互換のデータベースクライアント拡張と Go 製 Core Engine から成るモノレポです。拡張は軽量 UI と資格情報の安全な取り扱いを担い、Core Engine が重い DB I/O・SSH・ストリーミング処理を担当します。

## リポジトリ構成

- `extension/` — VS Code / Cursor 拡張 (TypeScript + Webview + Vite)
- `core/` — Go 1.22 Core Engine (JSON-RPC over stdio)
- `docs/`, `examples/`, `scripts/`, `test/` — 設計資料や将来のテスト資産の置き場

## 前提条件

- Node.js 20.x / npm
- Go 1.22+
- Docker (統合テスト用 PostgreSQL 起動)
- VS Code または Cursor (FluxGrid 拡張をデバッグするため)

## セットアップ

### 1. Node 依存パッケージの導入

```bash
cd /Users/mah/work/FluxGrid/extension
npm install
```

### 2. Core Engine のビルド

```bash
cd /Users/mah/work/FluxGrid/core
go mod tidy    # 初回のみ依存を取得
go build -o ../core/bin/core ./cmd/core
```

> **NOTE:** このリポジトリを初期化した環境では Go コマンドが未インストールでした。Go 1.22 以上を導入し、上記コマンドを実行してください。

### 3. 拡張の開発モード

別ターミナルで以下を実行し、Extension Host を起動します。

```bash
cd /Users/mah/work/FluxGrid/extension
npm run dev    # tsc --watch + vite --watch
```

VS Code 側では `Run and Debug > FluxGrid Extension` を選び、Extension Host を立ち上げてください。(`.vscode/launch.json` は次スプリントで追加予定です。)

### 4. Core Engine のスタンドアロン実行 (任意)

```bash
cd /Users/mah/work/FluxGrid/core
go run ./cmd/core --stdio
```

標準入出力経由で JSON-RPC リクエストを送るとレスポンスが得られます。

## Docker での PostgreSQL 起動例

```bash
docker run --rm \
  --name fluxgrid-pg \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:15
```

拡張の設定 (`fluxgrid.developmentConnectionString`) もしくは `FLUXGRID_DSN` 環境変数に以下を指定すると、`SELECT 1;` が実行可能です。

```
postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable
```

## 最小稼働フロー

1. Core Engine をビルド (`core/bin/core`)
2. 拡張をデバッグ実行 (`npm run dev` → VS Code Extension Host)
3. SQL ファイルで `SELECT 1;` を選択し `⌘ + Enter` (または `FluxGrid: クエリを実行`)
4. Webview パネルに「最新の結果を受信しました。」が表示され、通知で実行結果が確認できます

## テスト

統合テストフレームワークは次スプリントで導入予定ですが、当面は以下で疎通確認できます。

```bash
# Core Engine の最小疎通テスト
cd /Users/mah/work/FluxGrid/core
go test ./...
```

## ライセンス

MIT License (詳しくは `LICENSE` 追加予定)。

