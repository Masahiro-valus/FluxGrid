import * as vscode from "vscode";
import type { CoreClient } from "../coreClient";
import type { ConnectionService } from "../services/connectionService";
import type { ConnectionInput, HydratedConnection } from "../storage/connectionStore";
import { buildDsn } from "./dsn";

type ConnectionMessage =
  | { type: "connection.list" }
  | { type: "connection.create"; payload: ConnectionInput }
  | { type: "connection.update"; payload: ConnectionInput & { id: string } }
  | { type: "connection.delete"; payload: { id: string } }
  | { type: "connection.select"; payload: { id: string } }
  | { type: "connection.test"; payload: ConnectionInput & { options?: Record<string, unknown> } };

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
    type === "connection.select" ||
    type === "connection.test"
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

async function postStatus(
  webview: vscode.Webview,
  message: string,
  tone: "info" | "error" = "info"
) {
  await webview.postMessage({
    type: "connection.status",
    payload: message,
    tone
  });
}

export function createConnectionMessageRouter(
  webview: vscode.Webview,
  service: ConnectionService,
  coreClient: CoreClient,
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
        case "connection.test": {
          await handleConnectionTest(webview, event.data.payload, coreClient);
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

async function handleConnectionTest(
  webview: vscode.Webview,
  payload: ConnectionInput & { options?: Record<string, unknown> },
  coreClient: CoreClient
): Promise<void> {
  try {
    const dsn = buildDsn(payload as HydratedConnection);
    const sslmode =
      payload.options && (payload.options.ssl as boolean | undefined) ? "require" : "disable";
    await coreClient.sendRequest("connect.test", {
      driver: payload.driver,
      dsn,
      options: {
        timeoutSeconds: 10,
        sslmode
      }
    });
    await webview.postMessage({
      type: "connection.test.result",
      payload: {
        ok: true,
        message: "Connection test succeeded."
      }
    });
  } catch (error) {
    await webview.postMessage({
      type: "connection.test.result",
      payload: {
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed."
      }
    });
  }
}
