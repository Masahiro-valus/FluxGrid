import * as vscode from "vscode";
import { CoreClient } from "../coreClient";

export interface QueryExecutionParams {
  sql: string;
  connection?: {
    driver: string;
    dsn: string;
  };
  options?: {
    timeoutSeconds?: number;
  };
}

export interface QueryExecutionResult {
  columns?: { name: string; dataType: string }[];
  rows: unknown[][];
  executionTimeMs: number;
}

export type QueryEvent =
  | { type: "executionStarted"; sql: string }
  | { type: "executionSucceeded"; result: QueryExecutionResult }
  | { type: "executionFailed"; error: Error };

export type QueryEventListener = (event: QueryEvent) => void;

export class QueryService implements vscode.Disposable {
  private readonly listeners = new Set<QueryEventListener>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly coreClient: CoreClient) {}

  onDidChange(listener: QueryEventListener): vscode.Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => this.listeners.delete(listener)
    };
  }

  async execute(
    params: QueryExecutionParams,
    cancellation: vscode.CancellationTokenSource
  ): Promise<QueryExecutionResult> {
    if (!params.connection) {
      throw new Error("connection is required");
    }
    if (!params.sql || !params.sql.trim()) {
      throw new Error("sql is required");
    }

    this.emit({ type: "executionStarted", sql: params.sql });

    const disposable = cancellation.token.onCancellationRequested(() => {
      void this.coreClient.sendNotification("query.cancel", { sql: params.sql });
    });
    if (disposable) {
      this.disposables.push(disposable);
    }

    try {
      const result = await this.coreClient.sendRequest<QueryExecutionResult>(
        "query.execute",
        {
          sql: params.sql,
          connection: params.connection,
          options: params.options ?? {}
        },
        cancellation.token
      );

      this.emit({ type: "executionSucceeded", result });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: "executionFailed", error: err });
      throw err;
    }
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private emit(event: QueryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("QueryService listener error", error);
      }
    }
  }
}
