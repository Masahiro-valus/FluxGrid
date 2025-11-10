import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CancellationTokenSource } from "vscode";
import { QueryService } from "../src/services/queryService";
import type { LogService } from "../src/services/logService";

describe("QueryService", () => {
  const createCoreClient = () => ({
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
    onNotification: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn()
  });

  let service: QueryService;
  let coreClient: ReturnType<typeof createCoreClient>;
  let logService: LogService;
  let appendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    coreClient = createCoreClient();
    appendMock = vi.fn();
    logService = {
      append: appendMock
    } as unknown as LogService;
    service = new QueryService(coreClient as any, logService);
  });

  it("executes query using core client", async () => {
    const tokenSource = {
      token: { onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })) },
      dispose: vi.fn(),
      cancel: vi.fn()
    } as unknown as CancellationTokenSource;
    coreClient.sendRequest.mockResolvedValue({
      rows: [[1]],
      executionTimeMs: 10
    });

    const result = await service.execute(
      {
        sql: "SELECT 1",
        connection: { driver: "postgres", dsn: "postgres://..." },
        options: { timeoutSeconds: 30, mode: "batch" }
      },
      tokenSource
    );

    expect(coreClient.sendRequest).toHaveBeenCalledWith(
      "query.execute",
      expect.objectContaining({
        sql: "SELECT 1",
        connection: { driver: "postgres", dsn: "postgres://..." },
        options: expect.objectContaining({
          timeoutSeconds: 30,
          mode: "batch"
        })
      }),
      tokenSource.token
    );
    expect(result.rows[0][0]).toBe(1);
    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: "info", source: "extension" })
    );
    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        source: "extension",
        message: expect.stringContaining("Query succeeded")
      })
    );
  });

  it("registers cancellation callback", async () => {
    const tokenSource = {
      token: { onCancellationRequested: vi.fn((cb) => cb) },
      dispose: vi.fn(),
      cancel: vi.fn()
    } as unknown as CancellationTokenSource;

    coreClient.sendRequest.mockResolvedValue({ rows: [], executionTimeMs: 0 });
    await service.execute(
      {
        sql: "SELECT 1",
        connection: { driver: "postgres", dsn: "postgres://..." },
        options: { mode: "batch" }
      },
      tokenSource
    );

    expect(tokenSource.token.onCancellationRequested).toHaveBeenCalled();
  });

  it("raises error when no active connection is provided", async () => {
    await expect(
      service.execute(
        {
          sql: "",
          connection: undefined as any
        },
        {
          token: {},
          dispose: vi.fn(),
          cancel: vi.fn()
        } as unknown as CancellationTokenSource
      )
    ).rejects.toThrow("connection is required");
  });

  it("propagates errors from core client", async () => {
    const tokenSource = {
      token: { onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })) },
      dispose: vi.fn(),
      cancel: vi.fn()
    } as unknown as CancellationTokenSource;
    coreClient.sendRequest.mockRejectedValue(new Error("boom"));

    await expect(
      service.execute(
        {
          sql: "SELECT 1",
          connection: { driver: "postgres", dsn: "postgres://..." },
          options: { mode: "batch" }
        },
        tokenSource
      )
    ).rejects.toThrow("boom");
    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining("Query failed")
      })
    );
  });

  it("disposes listeners when service disposed", () => {
    const subscription = service.onDidChange(() => undefined);
    service.dispose();
    expect(() => subscription.dispose()).not.toThrow();
  });
});

