# FluxGrid Sprint Backlog (2 Weeks)

| # | タイトル | 優先度 | 完了条件 |
|---|----------|--------|----------|
| 1 | VS Code launch.json 整備 | P1 | `extension/.vscode/launch.json` で拡張とWebviewの同時デバッグが可能 |
| 2 | SecretStorage 実装 | P1 | 接続設定保存時に SecretStorage に暗号化保存され、平文設定が残らない |
| 3 | 接続テスト UI | P1 | 新規接続作成時に「テスト接続」ボタンで成功/失敗が表示される |
| 4 | Core: SSH トンネル実装 | P1 | `query.execute` が SSH 経由で Postgres/MySQL に到達できる |
| 5 | Core: MySQL/SQLite ドライバー追加 | P1 | `query.execute` で mysql / sqlite ドライバーが選択可能 |
| 6 | ストリーミング結果配信 | P1 | 大規模 SELECT をチャンク分割して Webview にストリーム送信 |
| 7 | 仮想化グリッド導入 | P1 | Webview に Glide Data Grid を組み込み 10万行スクロールが滑らか |
| 8 | キャンセル確実化 | P1 | Esc ショートカットで `query.cancel` が発火し、Core 側で中断ログが残る |
| 9 | スキーマブラウザ MVP | P2 | DB/Schema/Table ツリーと DDL 表示が行える |
|10 | ログレベル切替 UI | P2 | 拡張コマンドで Core Engine のログレベルを INFO/DEBUG で切替可能 |
|11 | CSV/JSON エクスポート | P2 | 結果グリッドから CSV/JSON 保存ダイアログが呼び出せる |
|12 | Docker Compose テスト環境 | P2 | `docker compose up` で Postgres/MySQL/SQLite ファームを起動し統合テストを実行 |
|13 | GolangCI-Lint 導入 | P3 | `golangci-lint run` が CI で実行され、重大な警告がゼロ |
|14 | CI/CD パイプライン初期化 | P3 | GitHub Actions で lint/test/build が自動化 |
|15 | macOS Keychain 実機検証 | P3 | SecretStorage 経由で Keychain 保存されることを QA |

