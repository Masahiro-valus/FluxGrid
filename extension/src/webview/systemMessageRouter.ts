import * as vscode from "vscode";

interface ClipboardWriteMessage {
  type: "clipboard.write";
  payload: {
    text: string;
  };
}

type SystemMessage = ClipboardWriteMessage;

function isSystemMessage(message: unknown): message is SystemMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const { type } = message as { type?: unknown };
  return type === "clipboard.write";
}

export function createSystemMessageRouter(
  webview: vscode.Webview,
  disposables: vscode.Disposable[]
): void {
  const listener = webview.onDidReceiveMessage(async (event: { data: unknown }) => {
    if (!isSystemMessage(event.data)) {
      return;
    }

    const { payload } = event.data;
    const text = payload?.text;
    if (typeof text !== "string") {
      await webview.postMessage({
        type: "clipboard.write.result",
        payload: { ok: false, message: "Invalid clipboard payload" }
      });
      return;
    }

    try {
      await vscode.env.clipboard.writeText(text);
      await webview.postMessage({
        type: "clipboard.write.result",
        payload: { ok: true }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await webview.postMessage({
        type: "clipboard.write.result",
        payload: { ok: false, message }
      });
    }
  });

  disposables.push(listener);
}
