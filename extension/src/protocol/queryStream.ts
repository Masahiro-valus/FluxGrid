export interface QueryStreamColumn {
  name: string;
  dataType: string;
}

export interface QueryStreamStartMessage {
  type: "query.stream.start";
  requestId: string;
  cursor?: string;
  columns: QueryStreamColumn[];
  rowCount?: number;
  pace: "auto" | "manual";
}

export interface QueryStreamChunkMessage {
  type: "query.stream.chunk";
  requestId: string;
  seq: number;
  rows: unknown[][];
  hasMore: boolean;
  cursor?: string;
  statistics?: {
    executionTimeMs?: number;
    networkLatencyMs?: number;
  };
}

export interface QueryStreamCompleteMessage {
  type: "query.stream.complete";
  requestId: string;
  cursor?: string;
  statistics?: {
    executionTimeMs?: number;
    totalRows?: number;
  };
}

export interface QueryStreamErrorMessage {
  type: "query.stream.error";
  requestId: string;
  code: string;
  message: string;
  fatal: boolean;
  details?: unknown;
}

export interface QueryStreamAckMessage {
  type: "query.stream.ack";
  requestId: string;
  seq: number;
}

export type QueryStreamInboundMessage =
  | QueryStreamStartMessage
  | QueryStreamChunkMessage
  | QueryStreamCompleteMessage
  | QueryStreamErrorMessage;

export interface QueryStreamAssemblerOptions {
  highWaterMark: number;
  onAck?: (ack: QueryStreamAckMessage) => void;
  onComplete?: (state: QueryStreamState) => void;
  onError?: (error: Error) => void;
}

export interface QueryStreamState {
  requestId: string;
  columns: QueryStreamColumn[];
  rows: unknown[][];
  cursor?: string;
  statistics?: QueryStreamCompleteMessage["statistics"];
}

export class QueryStreamAssembler {
  private readonly options: QueryStreamAssemblerOptions;
  private bufferedSinceAck = 0;
  private requestId: string | undefined;
  private _columns: QueryStreamColumn[] = [];
  private _rows: unknown[][] = [];
  private cursor: string | undefined;
  private completeStatistics: QueryStreamCompleteMessage["statistics"];

  constructor(options: QueryStreamAssemblerOptions) {
    this.options = options;
  }

  get rows(): unknown[][] {
    return this._rows;
  }

  get columns(): QueryStreamColumn[] {
    return this._columns;
  }

  handle(message: QueryStreamInboundMessage): void {
    switch (message.type) {
      case "query.stream.start":
        this.handleStart(message);
        break;
      case "query.stream.chunk":
        this.handleChunk(message);
        break;
      case "query.stream.complete":
        this.handleComplete(message);
        break;
      case "query.stream.error":
        this.handleError(message);
        break;
      default:
        break;
    }
  }

  private handleStart(message: QueryStreamStartMessage): void {
    this.requestId = message.requestId;
    this._columns = [...message.columns];
    this._rows = [];
    this.cursor = message.cursor;
    this.bufferedSinceAck = 0;
    this.completeStatistics = undefined;
  }

  private handleChunk(message: QueryStreamChunkMessage): void {
    if (!this.requestId) {
      this.requestId = message.requestId;
    }

    this._rows.push(...message.rows);
    this.bufferedSinceAck += message.rows.length;
    this.cursor = message.cursor ?? this.cursor;

    const shouldAck =
      this.options.highWaterMark > 0 && this.bufferedSinceAck >= this.options.highWaterMark;

    if (shouldAck || !message.hasMore) {
      this.options.onAck?.({
        type: "query.stream.ack",
        requestId: message.requestId,
        seq: message.seq
      });
      this.bufferedSinceAck = 0;
    }
  }

  private handleComplete(message: QueryStreamCompleteMessage): void {
    this.completeStatistics = message.statistics;
    this.cursor = message.cursor ?? this.cursor;

    if (!this.requestId) {
      this.requestId = message.requestId;
    }

    this.options.onComplete?.({
      requestId: this.requestId,
      columns: this._columns,
      rows: [...this._rows],
      cursor: this.cursor,
      statistics: this.completeStatistics
    });
  }

  private handleError(message: QueryStreamErrorMessage): void {
    const error = new Error(`Stream error (${message.code}): ${message.message}`);

    this.options.onError?.(error);
    // reset buffering to avoid leaking stale state
    this._rows = [];
    this._columns = [];
    this.bufferedSinceAck = 0;
    this.requestId = undefined;
    this.cursor = undefined;
    this.completeStatistics = undefined;
  }
}
