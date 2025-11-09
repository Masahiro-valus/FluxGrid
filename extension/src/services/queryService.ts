import * as vscode from "vscode";
import { CoreClient } from "../coreClient";
import {
  QueryStreamAssembler,
  type QueryStreamColumn,
  type QueryStreamState
} from "../protocol/queryStream";

export interface QueryExecutionParams {
  sql: string;
  connection?: {
    driver: string;
    dsn: string;
  };
  options?: {
    timeoutSeconds?: number;
    mode?: "stream" | "batch";
    stream?: {
      highWaterMark?: number;
      fetchSize?: number;
    };
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
  | { type: "executionFailed"; error: Error; requestId?: string }
  | { type: "streamStarted"; requestId: string; columns: QueryStreamColumn[] }
  | {
      type: "streamChunk";
      requestId: string;
      rows: unknown[][];
      seq: number;
      hasMore: boolean;
      statistics?: { executionTimeMs?: number; networkLatencyMs?: number };
    }
  | { type: "streamComplete"; requestId: string; state: QueryStreamState }
  | { type: "streamError"; requestId: string; error: Error };

export type QueryEventListener = (event: QueryEvent) => void;

export class QueryService implements vscode.Disposable {
  private readonly listeners = new Set<QueryEventListener>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly streamAssemblers = new Map<string, QueryStreamAssembler>();
  private readonly completedStates = new Map<string, QueryStreamState>();
  private readonly streamHighWaterMark = 5000;

  constructor(private readonly coreClient: CoreClient) {
    this.disposables.push(
      this.coreClient.onNotification("query.stream.start", (params) =>
        this.handleStreamNotification("query.stream.start", params)
      ),
      this.coreClient.onNotification("query.stream.chunk", (params) =>
        this.handleStreamNotification("query.stream.chunk", params)
      ),
      this.coreClient.onNotification("query.stream.complete", (params) =>
        this.handleStreamNotification("query.stream.complete", params)
      ),
      this.coreClient.onNotification("query.stream.error", (params) =>
        this.handleStreamNotification("query.stream.error", params)
      )
    );
  }

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

    const cancellationDisposable = cancellation.token.onCancellationRequested(() => {
      void this.coreClient.sendNotification("query.cancel", { sql: params.sql });
    });
    if (cancellationDisposable) {
      this.disposables.push(cancellationDisposable);
    }

    try {
      const mode = params.options?.mode ?? "stream";
      const highWaterMark = params.options?.stream?.highWaterMark ?? this.streamHighWaterMark;
      const fetchSize = params.options?.stream?.fetchSize ?? 256;

      const requestPayload = {
        sql: params.sql,
        connection: params.connection,
        options: {
          timeoutSeconds: params.options?.timeoutSeconds,
          maxRows:
            params.options?.mode === "batch"
              ? (params.options?.stream?.fetchSize ?? 500)
              : undefined,
          mode,
          stream: {
            highWaterMark,
            fetchSize
          }
        }
      };

      const result = await this.coreClient.sendRequest<QueryExecutionResult>(
        "query.execute",
        requestPayload,
        cancellation.token
      );

      if (
        mode === "stream" &&
        result &&
        typeof result === "object" &&
        result !== null &&
        "requestId" in result &&
        typeof (result as Record<string, unknown>).requestId === "string"
      ) {
        const requestId = (result as Record<string, unknown>).requestId as string;
        const state = this.completedStates.get(requestId);
        if (state) {
          this.completedStates.delete(requestId);
          const executionTimeMs = state.statistics?.executionTimeMs ?? 0;
          const streamResult: QueryExecutionResult = {
            columns: state.columns.map((column) => ({
              name: column.name,
              dataType: column.dataType
            })),
            rows: state.rows,
            executionTimeMs
          };
          this.emit({ type: "executionSucceeded", result: streamResult });
          return streamResult;
        }
      }

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

  private handleStreamNotification(method: string, params: unknown): void {
    if (!isRecord(params)) {
      return;
    }

    switch (method) {
      case "query.stream.start":
        this.onStreamStart(params);
        break;
      case "query.stream.chunk":
        this.onStreamChunk(params);
        break;
      case "query.stream.complete":
        this.onStreamComplete(params);
        break;
      case "query.stream.error":
        this.onStreamError(params);
        break;
      default:
        break;
    }
  }

  private onStreamStart(payload: Record<string, unknown>): void {
    const requestId = toStringOrUndefined(payload.requestId);
    if (!requestId) {
      return;
    }
    const columns = parseColumns(payload.columns);
    const assembler = new QueryStreamAssembler({
      highWaterMark: this.streamHighWaterMark,
      onAck: (ack) => {
        void this.coreClient.sendNotification("query.stream.ack", {
          requestId: ack.requestId,
          seq: ack.seq
        });
      },
      onComplete: (state) => {
        this.streamAssemblers.delete(state.requestId);
        this.completedStates.set(state.requestId, state);
        this.emit({ type: "streamComplete", requestId: state.requestId, state });
      },
      onError: (error) => {
        this.streamAssemblers.delete(requestId);
        this.emit({ type: "streamError", requestId, error });
      }
    });

    this.streamAssemblers.set(requestId, assembler);
    assembler.handle({
      type: "query.stream.start",
      requestId,
      columns,
      cursor: toStringOrUndefined(payload.cursor),
      pace: "auto",
      rowCount: typeof payload.rowCount === "number" ? payload.rowCount : undefined
    });

    this.emit({ type: "streamStarted", requestId, columns });
  }

  private onStreamChunk(payload: Record<string, unknown>): void {
    const requestId = toStringOrUndefined(payload.requestId);
    if (!requestId) {
      return;
    }
    const assembler = this.streamAssemblers.get(requestId);
    if (!assembler) {
      return;
    }

    const rows = parseRows(payload.rows);
    const seq = typeof payload.seq === "number" ? payload.seq : Number(payload.seq ?? 0);
    const hasMore = Boolean(payload.hasMore);

    assembler.handle({
      type: "query.stream.chunk",
      requestId,
      seq,
      rows,
      hasMore,
      cursor: toStringOrUndefined(payload.cursor),
      statistics: isRecord(payload.statistics)
        ? (payload.statistics as Record<string, number>)
        : undefined
    });

    this.emit({
      type: "streamChunk",
      requestId,
      rows,
      seq,
      hasMore,
      statistics: isRecord(payload.statistics)
        ? (payload.statistics as { executionTimeMs?: number; networkLatencyMs?: number })
        : undefined
    });
  }

  private onStreamComplete(payload: Record<string, unknown>): void {
    const requestId = toStringOrUndefined(payload.requestId);
    if (!requestId) {
      return;
    }
    const assembler = this.streamAssemblers.get(requestId);
    if (!assembler) {
      return;
    }

    assembler.handle({
      type: "query.stream.complete",
      requestId,
      cursor: toStringOrUndefined(payload.cursor),
      statistics: isRecord(payload.statistics)
        ? (payload.statistics as Record<string, number>)
        : undefined
    });
  }

  private onStreamError(payload: Record<string, unknown>): void {
    const requestId = toStringOrUndefined(payload.requestId);
    if (!requestId) {
      return;
    }

    const assembler = this.streamAssemblers.get(requestId);
    if (assembler) {
      assembler.handle({
        type: "query.stream.error",
        requestId,
        code: toStringOrUndefined(payload.code) ?? "STREAM_ERROR",
        message: toStringOrUndefined(payload.message) ?? "Stream failed",
        fatal: Boolean(payload.fatal),
        details: payload.details
      });
      this.streamAssemblers.delete(requestId);
    } else {
      const error = new Error(toStringOrUndefined(payload.message) ?? "Stream failed");
      this.emit({ type: "streamError", requestId, error });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return undefined;
}

function parseColumns(value: unknown): QueryStreamColumn[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const columns: QueryStreamColumn[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = toStringOrUndefined(entry.name);
    const dataType = toStringOrUndefined(entry.dataType) ?? "text";
    if (name) {
      columns.push({ name, dataType });
    }
  }
  return columns;
}

function parseRows(value: unknown): unknown[][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((row): row is unknown[] => Array.isArray(row)).map((row) => [...row]);
}
