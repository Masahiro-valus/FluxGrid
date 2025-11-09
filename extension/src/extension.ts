import * as vscode from "vscode";
import { CoreClient } from "./coreClient";
import { ResultsPanel } from "./webviewPanel";
import { disposeConnectionStore, getConnectionStore } from "./storage";
import { ConnectionService } from "./services/connectionService";
import { registerConnectionCommands } from "./commands/connectionCommands";

let coreClient: CoreClient | undefined;
let coreReady = false;
let panel: ResultsPanel | undefined;
let connectionService: ConnectionService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const connectionStore = getConnectionStore(context);
  connectionService = new ConnectionService(connectionStore);
  registerConnectionCommands(context, connectionService);
  coreClient = new CoreClient(context);

  try {
    await coreClient.start();
    await coreClient.sendRequest("core.ping", { timestamp: Date.now() });
    coreReady = true;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start Core Engine: ${String(error)}`);
  }

  const openPanel = vscode.commands.registerCommand("fluxgrid.openPanel", () => {
    panel = ResultsPanel.createOrShow(context);
    panel.setStatus(coreReady ? "Ready for queries" : "Initializing Core Engine...");
  });

  const executeQuery = vscode.commands.registerCommand("fluxgrid.executeQuery", async () => {
    if (!coreClient) {
      vscode.window.showErrorMessage("Core Engine is not available.");
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("Open an editor containing SQL to execute.");
      return;
    }

    const selection = editor.selection;
    const sql = selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(selection);

    if (!sql.trim()) {
      vscode.window.showWarningMessage("No SQL selected to execute.");
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
    vscode.window.setStatusBarMessage("FluxGrid: Running query… (Press Esc to cancel)", 5000);

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
      const message = `Query succeeded (${rowCount} rows, ${result.executionTimeMs.toFixed(1)} ms)`;
      vscode.window.setStatusBarMessage(`FluxGrid: ${message}`, 5000);
      vscode.window.showInformationMessage(message);

      panel = ResultsPanel.createOrShow(context);
      panel.setStatus("Received latest results.");
    } catch (error) {
      vscode.window.showErrorMessage(`Query failed: ${String(error)}`);
    } finally {
      cancellation.dispose();
      disposable.dispose();
    }
  });

  context.subscriptions.push(openPanel, executeQuery, {
    dispose: () => {
      coreClient?.dispose();
      disposeConnectionStore();
    }
  });
}

export function deactivate(): void {
  coreClient?.dispose();
  disposeConnectionStore();
  connectionService = undefined;
}

