import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { CancellationTokenSource } from "vscode";
import { CancellationError } from "vscode";
import { createQueryMessageRouter } from "../src/webview/queryMessageRouter";
import type { QueryService } from "../src/services/queryService";
import type { ConnectionService } from "../src/services/connectionService";

vi.mock("vscode", () => import("./__mocks__/vscode"));

const fakeWebview = () => {
  const listeners: ((event: { data: unknown }) => void)[] = [];
  return {
    postMessage: vi.fn(async () => undefined),
    onDidReceiveMessage: (listener: (event: { data: unknown }) => void) => {
      listeners.push(listener);
      return { dispose: vi.fn() };
    },
    emit: async (data: unknown) => {
      await Promise.all(listeners.map((listener) => listener({ data })));
    }
  };
};

describe("createQueryMessageRouter", () => {
  let webview: ReturnType<typeof fakeWebview>;
  let queryService: vi.Mocked<QueryService>;
  let connectionService: vi.Mocked<ConnectionService>;
  let disposables: vscode.Disposable[];

  beforeEach(() => {
    webview = fakeWebview();
    queryService = {
      execute: vi.fn(),
      dispose: vi.fn()
    } as unknown as vi.Mocked<QueryService>;
    connectionService = {
      getConnection: vi.fn(async () => ({
        id: "1",
        name: "Local",
        driver: "postgres",
        host: "localhost",
        port: 5432,
        database: "postgres",
        username: "postgres",
        password: "pw",
        options: { ssl: false },
        secretId: "",
        createdAt: "",
        updatedAt: ""
      }))
    } as unknown as vi.Mocked<ConnectionService>;
    disposables = [];
  });

  it("executes queries through QueryService and posts results", async () => {
    queryService.execute.mockResolvedValue({
      rows: [[1]],
      columns: [{ name: "count", dataType: "int4" }],
      executionTimeMs: 10
    });

    createQueryMessageRouter(
      webview as unknown as vscode.Webview,
      queryService,
      connectionService,
      disposables
    );

    await webview.emit({
      type: "query.run",
      payload: {
        sql: "SELECT 1",
        connectionId: "1",
        options: { timeoutSeconds: 5 }
      }
    });

    expect(queryService.execute).toHaveBeenCalledWith(
      {
        sql: "SELECT 1",
        connection: {
          driver: "postgres",
          dsn: expect.stringContaining("postgresql://")
        },
        options: { timeoutSeconds: 5 }
      },
      expect.anything()
    );
    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: "query.execution.started",
        payload: { sql: "SELECT 1" }
      })
    );
    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: "query.execution.succeeded",
        payload: expect.objectContaining({ rows: [[1]] })
      })
    );
  });

  it("cancels running execution when receiving query.cancel", async () => {
    queryService.execute.mockImplementation((_params, tokenSource: CancellationTokenSource) => {
      return new Promise((_resolve, reject) => {
        tokenSource.token.onCancellationRequested(() => {
          reject(new CancellationError("cancelled"));
        });
      });
    });

    createQueryMessageRouter(
      webview as unknown as vscode.Webview,
      queryService,
      connectionService,
      disposables
    );

    void webview.emit({
      type: "query.run",
      payload: {
        sql: "SELECT pg_sleep(10)",
        connectionId: "1"
      }
    });

    await vi.waitFor(() => expect(queryService.execute).toHaveBeenCalledOnce());

    void webview.emit({ type: "query.cancel" });

    const tokenSource = queryService.execute.mock.calls[0][1] as CancellationTokenSource;
    await vi.waitFor(() => expect(tokenSource.cancel).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith({ type: "query.execution.cancelled" })
    );
  });
});

