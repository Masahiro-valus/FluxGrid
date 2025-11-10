import * as vscode from "vscode";
import { ConnectionService } from "./services/connectionService";
import { QueryService } from "./services/queryService";
import { CoreClient } from "./coreClient";
import { createConnectionMessageRouter } from "./webview/connectionMessageRouter";
import { createQueryMessageRouter } from "./webview/queryMessageRouter";
import { SchemaService } from "./services/schemaService";
import { createSchemaMessageRouter } from "./webview/schemaMessageRouter";
import { randomBytes } from "crypto";

export class ResultsPanel implements vscode.Disposable {
  private static current: ResultsPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  static createOrShow(
    context: vscode.ExtensionContext,
    connectionService: ConnectionService,
    queryService: QueryService,
    schemaService: SchemaService,
    coreClient: CoreClient
  ): ResultsPanel {
    if (ResultsPanel.current) {
      ResultsPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return ResultsPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      "fluxgrid.results",
      "FluxGrid",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "webview")]
      }
    );

    ResultsPanel.current = new ResultsPanel(
      panel,
      context,
      connectionService,
      queryService,
      schemaService,
      coreClient
    );
    return ResultsPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly connectionService: ConnectionService,
    private readonly queryService: QueryService,
    private readonly schemaService: SchemaService,
    private readonly coreClient: CoreClient
  ) {
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => {
      this.dispose();
    });

    createConnectionMessageRouter(
      this.panel.webview,
      this.connectionService,
      this.coreClient,
      this.disposables
    );
    createQueryMessageRouter(
      this.panel.webview,
      this.queryService,
      this.connectionService,
      this.disposables
    );
    createSchemaMessageRouter(this.panel.webview, this.schemaService, this.disposables);
  }

  setStatus(message: string): void {
    this.panel.webview.postMessage({
      type: "connection.status",
      payload: message
    });
  }

  dispose(): void {
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
    if (ResultsPanel.current === this) {
      ResultsPanel.current = undefined;
    }
  }

  private getHtml(): string {
    const nonce = randomBytes(16).toString("base64");
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "main.js")
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "main.css")
    );
    const cspSource = this.panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}">
    <title>FluxGrid</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
