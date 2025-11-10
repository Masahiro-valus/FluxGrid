import * as vscode from "vscode";
import type { LogEntry, LogService } from "../services/logService";

type LogMessage = { type: "log.subscribe" } | { type: "log.clear" };

function isLogMessage(message: unknown): message is LogMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const { type } = message as { type?: unknown };
  return type === "log.subscribe" || type === "log.clear";
}

export function createLogMessageRouter(
  webview: vscode.Webview,
  logService: LogService,
  disposables: vscode.Disposable[]
): void {
  const postEntries = () => {
    const entries = logService.list();
    void webview.postMessage({
      type: "log.entries",
      payload: entries
    });
  };

  const listener = webview.onDidReceiveMessage(async (event: { data: unknown }) => {
    if (!isLogMessage(event.data)) {
      return;
    }

    if (event.data.type === "log.subscribe") {
      postEntries();
      return;
    }

    if (event.data.type === "log.clear") {
      logService.clear();
    }
  });

  const appendDisposable = logService.onDidAppend((entry: LogEntry) => {
    void webview.postMessage({
      type: "log.entry",
      payload: entry
    });
  });

  const clearDisposable = logService.onDidClear(() => {
    void webview.postMessage({ type: "log.cleared" });
  });

  disposables.push(listener, appendDisposable, clearDisposable);
}
