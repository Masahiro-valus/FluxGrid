import type * as vscode from "vscode";
import type { ConnectionService } from "../services/connectionService";
import type { ConnectionInput } from "../storage/connectionStore";

type ConnectionMessage =
  | { type: "connection.list" }
  | { type: "connection.create"; payload: ConnectionInput }
  | { type: "connection.update"; payload: ConnectionInput & { id: string } }
  | { type: "connection.delete"; payload: { id: string } }
  | { type: "connection.select"; payload: { id: string } };

interface ConnectionListResponse {
  type: "connection.list.result";
  payload: unknown;
  error?: string;
}

function isConnectionMessage(message: unknown): message is ConnectionMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const { type } = message as { type?: unknown };
  return (
    type === "connection.list" ||
    type === "connection.create" ||
    type === "connection.update" ||
    type === "connection.delete" ||
    type === "connection.select"
  );
}

async function postConnectionList(
  webview: vscode.Webview,
  service: ConnectionService
): Promise<void> {
  try {
    const list = await service.listConnections();
    const payload: ConnectionListResponse = {
      type: "connection.list.result",
      payload: list
    };
    await webview.postMessage(payload);
  } catch (error) {
    const payload: ConnectionListResponse = {
      type: "connection.list.result",
      payload: [],
      error: error instanceof Error ? error.message : String(error)
    };
    await webview.postMessage(payload);
  }
}

async function postStatus(webview: vscode.Webview, message: string, tone: "info" | "error" = "info") {
  await webview.postMessage({
    type: "connection.status",
    payload: message,
    tone
  });
}

export function createConnectionMessageRouter(
  webview: vscode.Webview,
  service: ConnectionService,
  disposables: vscode.Disposable[]
): void {
  const listener = webview.onDidReceiveMessage(async (event: { data: unknown }) => {
    if (!isConnectionMessage(event.data)) {
      return;
    }

    try {
      switch (event.data.type) {
        case "connection.list":
          await postConnectionList(webview, service);
          await postStatus(webview, "Connections refreshed.");
          break;
        case "connection.create":
          await service.createConnection(event.data.payload);
          await postConnectionList(webview, service);
          await postStatus(webview, `Connection ${event.data.payload.name} created.`);
          break;
        case "connection.update":
          await service.updateConnection(event.data.payload);
          await postConnectionList(webview, service);
          await postStatus(webview, `Connection ${event.data.payload.name} updated.`);
          break;
        case "connection.delete":
          await service.deleteConnection(event.data.payload.id);
          await postConnectionList(webview, service);
          await postStatus(webview, "Connection deleted.");
          break;
        case "connection.select": {
          const result = await service.getConnection(event.data.payload.id, {
            includeSecrets: true
          });
          await webview.postMessage({
            type: "connection.select.result",
            payload: result
          });
          if (!result) {
            await postStatus(webview, "Connection not found.", "error");
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      await webview.postMessage({
        type: "connection.error",
        error: error instanceof Error ? error.message : String(error)
      });
      await postStatus(webview, "Operation failed.", "error");
    }
  });

  const subscription = service.onDidChangeConnections(() => {
    void postConnectionList(webview, service);
  });

  void postConnectionList(webview, service);
  void postStatus(webview, "Connection panel ready.");

  disposables.push(listener, subscription);
}

