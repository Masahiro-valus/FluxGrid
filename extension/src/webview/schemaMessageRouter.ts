import * as vscode from "vscode";
import type { SchemaService } from "../services/schemaService";

type SchemaMessage = {
  type: "schema.list";
  payload?: {
    connectionId?: string;
    search?: string;
  };
};

function isSchemaMessage(message: unknown): message is SchemaMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const { type } = message as { type?: unknown };
  return type === "schema.list";
}

export function createSchemaMessageRouter(
  webview: vscode.Webview,
  schemaService: SchemaService,
  disposables: vscode.Disposable[]
): void {
  const listener = webview.onDidReceiveMessage(async (event: { data: unknown }) => {
    if (!isSchemaMessage(event.data)) {
      return;
    }

    try {
      const nodes = await schemaService.list({
        connectionId: event.data.payload?.connectionId,
        search: event.data.payload?.search
      });

      await webview.postMessage({
        type: "schema.list.result",
        payload: nodes
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load schema metadata.";
      await webview.postMessage({
        type: "schema.list.error",
        error: message
      });
    }
  });

  disposables.push(listener);
}
