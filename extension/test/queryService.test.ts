import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CancellationTokenSource, Disposable } from "vscode";
import { QueryService } from "../src/services/queryService";

const noopDispose = () => ({ dispose: vi.fn() });

describe("QueryService", () => {
  const createCoreClient = () => ({
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
    dispose: vi.fn()
  });

  const createContext = () => ({
    subscriptions: [] as Disposable[]
  });

  let service: QueryService;
  let coreClient: ReturnType<typeof createCoreClient>;
  let context: ReturnType<typeof createContext>;

  beforeEach(() => {
    context = createContext();
    coreClient = createCoreClient();
    service = new QueryService(coreClient as any, context as any);
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
        options: { timeoutSeconds: 30 }
      },
      tokenSource
    );

    expect(coreClient.sendRequest).toHaveBeenCalledWith(
      "query.execute",
      {
        sql: "SELECT 1",
        connection: { driver: "postgres", dsn: "postgres://..." },
        options: { timeoutSeconds: 30 }
      },
      tokenSource.token
    );
    expect(result.rows[0][0]).toBe(1);
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
        options: {}
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
          connection: { driver: "postgres", dsn: "postgres://..." }
        },
        tokenSource
      )
    ).rejects.toThrow("boom");
  });

  it("disposes listeners when service disposed", () => {
    const subscription = service.onDidChange(() => undefined);
    service.dispose();
    expect(subscription.dispose).not.toThrow;
  });
});

