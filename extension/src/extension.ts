import * as vscode from "vscode";
import { CoreClient } from "./coreClient";
import { ResultsPanel } from "./webviewPanel";

let coreClient: CoreClient | undefined;
let coreReady = false;
let panel: ResultsPanel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  coreClient = new CoreClient(context);

  try {
    await coreClient.start();
    await coreClient.sendRequest("core.ping", { timestamp: Date.now() });
    coreReady = true;
  } catch (error) {
    vscode.window.showErrorMessage(`Core Engine の起動に失敗しました: ${String(error)}`);
  }

  const openPanel = vscode.commands.registerCommand("fluxgrid.openPanel", () => {
    panel = ResultsPanel.createOrShow(context);
    panel.setStatus(coreReady ? "接続待機中" : "Core Engine 初期化中…");
  });

  const executeQuery = vscode.commands.registerCommand("fluxgrid.executeQuery", async () => {
    if (!coreClient) {
      vscode.window.showErrorMessage("Core Engine が初期化できませんでした。");
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("SQLを含むエディタを開いてください。");
      return;
    }

    const selection = editor.selection;
    const sql = selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(selection);

    if (!sql.trim()) {
      vscode.window.showWarningMessage("実行するSQLが空です。");
      return;
    }

    const settings = vscode.workspace.getConfiguration("fluxgrid");
    const defaultDsn =
      settings.get<string>("developmentConnectionString") ??
      process.env.FLUXGRID_DSN ??
      "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable";

    const request = {
      connection: {
        driver: "postgres",
        dsn: defaultDsn
      },
      sql,
      options: {
        timeoutSeconds: settings.get<number>("queryTimeoutSeconds") ?? 30
      }
    };

    const cancellation = new vscode.CancellationTokenSource();
    vscode.window.setStatusBarMessage("FluxGrid: クエリ実行中… (Escでキャンセル)", 5000);

    const disposable = vscode.commands.registerCommand("fluxgrid.cancelQuery", () => {
      cancellation.cancel();
    });

    try {
      const result = await coreClient.sendRequest<{
        columns: { name: string; dataType: string }[];
        rows: unknown[][];
        executionTimeMs: number;
      }>("query.execute", request, cancellation.token);

      const rowCount = result.rows?.length ?? 0;
      const message = `クエリ成功 (${rowCount} 行, ${result.executionTimeMs.toFixed(1)} ms)`;
      vscode.window.setStatusBarMessage(`FluxGrid: ${message}`, 5000);
      vscode.window.showInformationMessage(message);

      panel = ResultsPanel.createOrShow(context);
      panel.setStatus("最新の結果を受信しました。");
    } catch (error) {
      vscode.window.showErrorMessage(`クエリ実行に失敗しました: ${String(error)}`);
    } finally {
      cancellation.dispose();
      disposable.dispose();
    }
  });

  context.subscriptions.push(openPanel, executeQuery, {
    dispose: () => {
      coreClient?.dispose();
    }
  });
}

export function deactivate(): void {
  coreClient?.dispose();
}

