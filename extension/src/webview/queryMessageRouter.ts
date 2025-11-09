import * as vscode from "vscode";
import type { QueryService } from "../services/queryService";
import type { ConnectionService } from "../services/connectionService";
import type { HydratedConnection } from "../storage/connectionStore";
import { buildDsn } from "./dsn";

type QueryMessage =
  | {
      type: "query.run";
      payload: {
        sql: string;
        connectionId?: string;
        options?: {
          timeoutSeconds?: number;
        };
      };
    }
  | { type: "query.cancel" };

function isQueryMessage(message: unknown): message is QueryMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const { type } = message as { type?: unknown };
  return type === "query.run" || type === "query.cancel";
}

export function createQueryMessageRouter(
  webview: vscode.Webview,
  queryService: QueryService,
  connectionService: ConnectionService,
  disposables: vscode.Disposable[]
): void {
  let currentExecution:
    | {
        tokenSource: vscode.CancellationTokenSource;
      }
    | undefined;

  const listener = webview.onDidReceiveMessage(async (event: { data: unknown }) => {
    if (!isQueryMessage(event.data)) {
      return;
    }

    if (event.data.type === "query.cancel") {
      if (currentExecution) {
        currentExecution.tokenSource.cancel();
      }
      return;
    }

    const { sql, connectionId, options } = event.data.payload;
    if (!sql || !sql.trim()) {
      await webview.postMessage({
        type: "query.execution.failed",
        error: "SQL is required."
      });
      return;
    }

    try {
      const connection = await resolveConnection(connectionId, connectionService);
      if (!connection) {
        throw new Error("No connection selected.");
      }

      const tokenSource = new vscode.CancellationTokenSource();
      currentExecution?.tokenSource.cancel();
      currentExecution = { tokenSource };

      await webview.postMessage({
        type: "query.execution.started",
        payload: { sql }
      });

      try {
        const result = await queryService.execute(
          {
            sql,
            connection: {
              driver: connection.driver,
              dsn: buildDsn(connection)
            },
            options
          },
          tokenSource
        );

        if (currentExecution?.tokenSource === tokenSource) {
          currentExecution = undefined;
        }

        await webview.postMessage({
          type: "query.execution.succeeded",
          payload: result
        });
      } catch (error) {
        if (currentExecution?.tokenSource === tokenSource) {
          currentExecution = undefined;
        }
        if (error instanceof vscode.CancellationError) {
          await webview.postMessage({ type: "query.execution.cancelled" });
          return;
        }
        await webview.postMessage({
          type: "query.execution.failed",
          error: error instanceof Error ? error.message : "Query failed."
        });
      }
    } catch (error) {
      await webview.postMessage({
        type: "query.execution.failed",
        error: error instanceof Error ? error.message : "Query failed."
      });
    }
  });

  const serviceSubscription = queryService.onDidChange((event) => {
    switch (event.type) {
      case "streamStarted":
        void webview.postMessage({
          type: "query.stream.started",
          payload: {
            requestId: event.requestId,
            columns: event.columns
          }
        });
        break;
      case "streamChunk":
        void webview.postMessage({
          type: "query.stream.chunk",
          payload: {
            requestId: event.requestId,
            rows: event.rows,
            seq: event.seq,
            hasMore: event.hasMore,
            statistics: event.statistics
          }
        });
        break;
      case "streamComplete":
        void webview.postMessage({
          type: "query.stream.complete",
          payload: {
            requestId: event.requestId,
            statistics: event.state.statistics,
            columns: event.state.columns
          }
        });
        break;
      case "streamError":
        void webview.postMessage({
          type: "query.stream.error",
          payload: {
            requestId: event.requestId,
            message: event.error.message
          }
        });
        break;
      default:
        break;
    }
  });

  disposables.push(listener, serviceSubscription);
}

async function resolveConnection(
  connectionId: string | undefined,
  connectionService: ConnectionService
): Promise<HydratedConnection | undefined> {
  if (connectionId) {
    return connectionService.getConnection(connectionId, { includeSecrets: true });
  }

  const settings = vscode.workspace.getConfiguration("fluxgrid");
  const fallbackDsn =
    settings.get<string>("developmentConnectionString") ?? process.env.FLUXGRID_DSN;
  if (!fallbackDsn) {
    return undefined;
  }

  const parsed = parseDsn(fallbackDsn);
  return {
    id: "default",
    name: "Default",
    driver: parsed.driver,
    host: parsed.host ?? "",
    port: parsed.port ?? 0,
    database: parsed.database ?? "",
    username: parsed.username,
    options: parsed.options,
    secretId: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    password: parsed.password
  } as HydratedConnection;
}

function parseDsn(dsn: string): Partial<HydratedConnection> {
  const normalized = dsn.toLowerCase();
  const driver: HydratedConnection["driver"] = normalized.startsWith("mysql")
    ? "mysql"
    : normalized.startsWith("sqlite")
      ? "sqlite"
      : "postgres";
  return {
    driver,
    options: { raw: dsn },
    host: "",
    port: 0,
    database: "",
    username: "",
    password: undefined
  };
}
