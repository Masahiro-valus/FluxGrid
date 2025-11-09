# FluxGrid

![CI](https://github.com/Masahiro-valus/FluxGrid/actions/workflows/ci.yml/badge.svg)

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

## Docker ベースのテスト環境

統合テスト用に `docker-compose.yml` を提供しています。PostgreSQL(MySQL) を起動/停止するには以下を使用してください。

```bash
# DB コンテナの起動
./scripts/db/up.sh
# (オプション) 起動完了待ち
./scripts/db/wait.sh

# 起動状態の確認
docker compose ps

# 停止
./scripts/db/down.sh
```

デフォルト設定:

| サービス | ポート | ユーザー | パスワード | DB 名 |
|----------|--------|----------|------------|-------|
| Postgres | `55432` | fluxgrid | fluxgrid | fluxgrid |
| MySQL    | `53306` | fluxgrid | fluxgrid | fluxgrid |

Core の統合テストは今後のスプリントで追加予定ですが、`go test ./...` 実行前に上記コンテナを起動すると DSN が有効になります。

```
postgresql://fluxgrid:fluxgrid@localhost:55432/fluxgrid?sslmode=disable
mysql://fluxgrid:fluxgrid@tcp(localhost:53306)/fluxgrid
```

## 最小稼働フロー

1. Core Engine をビルド (`core/bin/core`)
2. 拡張をデバッグ実行 (`npm run dev` → VS Code Extension Host)
3. SQL ファイルで `SELECT 1;` を選択し `⌘ + Enter` (または `FluxGrid: クエリを実行`)
4. Webview パネルに「最新の結果を受信しました。」が表示され、通知で実行結果が確認できます

### 接続管理パネル

- `FluxGrid: Open Result Panel` コマンドで接続管理 UI を開くと、接続の追加/編集/削除が可能です
- Webview 側で送信した操作は `connection.*` JSON-RPC メッセージとして拡張・Core に連携されます
- 新規接続の検証は `connect.test` エンドポイント（PostgreSQL 対応済み）を経由してバックエンドで実施されます

## テスト

統合テストフレームワークは次スプリントで導入予定ですが、当面は以下で疎通確認できます。

```bash
# Core Engine の最小疎通テスト
cd /Users/mah/work/FluxGrid/core
go test ./...

# Extension のユニットテスト (Vitest)
cd /Users/mah/work/FluxGrid/extension
npm test

# ウォッチ実行
npm run test:watch
```

Vitest は `tsconfig.vitest.json` を通じてテスト実行時のみ `vitest` 型定義を読み込む構成です。TDD での開発を推奨しており、`npm test` で失敗するテストを先に書いてから実装を追加してください。

## CI

GitHub Actions (`.github/workflows/ci.yml`) は `main` と Pull Request に対して次を自動実行します。

- `npm ci`, `npm run build`, `npm test`
- `go mod download`, `go test ./...`
- テスト用 Postgres/MySQL コンテナを `services` として起動し、`FLUXGRID_*_DSN` を設定

ローカルでも CI 相当の検証を行いたい場合は以下を目安にしてください。

```bash
./scripts/db/up.sh
npm --prefix extension ci
npm --prefix extension run build
npm --prefix extension test
go test ./core/...
./scripts/db/down.sh
```

## ライセンス

MIT License (詳しくは `LICENSE` 追加予定)。

