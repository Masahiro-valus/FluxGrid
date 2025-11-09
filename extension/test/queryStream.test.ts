import { describe, expect, it } from "vitest";
import {
  QueryStreamAssembler,
  type QueryStreamChunkMessage,
  type QueryStreamStartMessage
} from "../src/protocol/queryStream";

const startMessage = (overrides: Partial<QueryStreamStartMessage> = {}): QueryStreamStartMessage => ({
  type: "query.stream.start",
  requestId: "req-1",
  cursor: "cursor-1",
  columns: [
    { name: "id", dataType: "int8" },
    { name: "name", dataType: "text" }
  ],
  rowCount: undefined,
  pace: "auto",
  ...overrides
});

const chunkMessage = (
  rows: unknown[][],
  overrides: Partial<QueryStreamChunkMessage> = {}
): QueryStreamChunkMessage => ({
  type: "query.stream.chunk",
  requestId: "req-1",
  seq: overrides.seq ?? 1,
  hasMore: overrides.hasMore ?? true,
  rows,
  cursor: overrides.cursor,
  statistics: overrides.statistics
});

describe("QueryStreamAssembler", () => {
  it("buffers rows and requests ack when high water mark reached", () => {
    const acks: unknown[] = [];

    const assembler = new QueryStreamAssembler({
      highWaterMark: 3,
      onAck: (ack) => acks.push(ack)
    });

    assembler.handle(startMessage());

    assembler.handle(
      chunkMessage([
        [1, "Alice"],
        [2, "Bob"]
      ])
    );

    expect(assembler.rows).toHaveLength(2);
    expect(acks).toHaveLength(0);

    assembler.handle(
      chunkMessage(
        [
          [3, "Carol"],
          [4, "Dave"]
        ],
        { seq: 2 }
      )
    );

    expect(assembler.rows).toHaveLength(4);
    expect(acks).toEqual([
      {
        type: "query.stream.ack",
        requestId: "req-1",
        seq: 2
      }
    ]);
  });

  it("invokes completion callback with metadata", () => {
    let completed: { rowCount: number; columns: number } | undefined;

    const assembler = new QueryStreamAssembler({
      highWaterMark: 2,
      onComplete: (state) => {
        completed = {
          rowCount: state.rows.length,
          columns: state.columns.length
        };
      }
    });

    assembler.handle(startMessage());
    assembler.handle(
      chunkMessage(
        [
          [1, "Alice"],
          [2, "Bob"]
        ],
        { seq: 1 }
      )
    );

    assembler.handle({
      type: "query.stream.complete",
      requestId: "req-1",
      cursor: "cursor-2",
      statistics: { executionTimeMs: 42.5 }
    });

    expect(completed).toEqual({
      rowCount: 2,
      columns: 2
    });
  });

  it("surfaces errors and clears pending state", () => {
    let seenError: Error | undefined;

    const assembler = new QueryStreamAssembler({
      highWaterMark: 2,
      onError: (err) => {
        seenError = err;
      }
    });

    assembler.handle(startMessage());

    assembler.handle({
      type: "query.stream.error",
      requestId: "req-1",
      code: "deadbeef",
      message: "boom",
      fatal: true
    });

    expect(seenError).toBeInstanceOf(Error);
    expect(seenError?.message).toContain("boom");
    expect(assembler.rows).toHaveLength(0);
  });
});

