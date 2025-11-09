import * as vscode from "vscode";

export class ResultsPanel implements vscode.Disposable {
  private static current: ResultsPanel | undefined;

  static createOrShow(context: vscode.ExtensionContext): ResultsPanel {
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

    ResultsPanel.current = new ResultsPanel(panel, context);
    return ResultsPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext
  ) {
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => {
      ResultsPanel.current = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === "ready") {
        this.setStatus("Core Engine 初期化中…");
      }
    });
  }

  setStatus(message: string): void {
    this.panel.webview.postMessage({
      type: "core-status",
      payload: message
    });
  }

  dispose(): void {
    this.panel.dispose();
  }

  private getHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "main.js")
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "assets", "style.css")
    );
    const cspSource = this.panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}">
    <title>FluxGrid</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

