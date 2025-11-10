import * as vscode from "vscode";
import type { SchemaService } from "../services/schemaService";

type SchemaMessage =
  | {
      type: "schema.list";
      payload?: {
        connectionId?: string;
        search?: string;
      };
    }
  | {
      type: "schema.ddl.get";
      payload: {
        connectionId?: string;
        schema: string;
        name: string;
      };
    };

function isSchemaMessage(message: unknown): message is SchemaMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const { type } = message as { type?: unknown };
  return type === "schema.list" || type === "schema.ddl.get";
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
      if (event.data.type === "schema.list") {
        const nodes = await schemaService.list({
          connectionId: event.data.payload?.connectionId,
          search: event.data.payload?.search
        });

        await webview.postMessage({
          type: "schema.list.result",
          payload: nodes
        });
      } else if (event.data.type === "schema.ddl.get") {
        const ddl = await schemaService.getDDL(event.data.payload);
        await webview.postMessage({
          type: "schema.ddl.result",
          payload: {
            schema: event.data.payload.schema,
            name: event.data.payload.name,
            ddl
          }
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load schema metadata.";
      if (event.data.type === "schema.list") {
        await webview.postMessage({
          type: "schema.list.error",
          error: message
        });
      } else {
        await webview.postMessage({
          type: "schema.ddl.error",
          error: message
        });
      }
    }
  });

  disposables.push(listener);
}
