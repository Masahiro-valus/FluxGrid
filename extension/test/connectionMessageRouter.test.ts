import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { createConnectionMessageRouter } from "../src/webview/connectionMessageRouter";
import type { ConnectionService } from "../src/services/connectionService";

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

describe("createConnectionMessageRouter", () => {
  let webview: ReturnType<typeof fakeWebview>;
  let service: vi.Mocked<ConnectionService>;
  let subscriptions: vscode.Disposable[];

  beforeEach(() => {
    webview = fakeWebview();
    service = {
      listConnections: vi.fn(async () => [{ id: "1", name: "Conn" }]),
      createConnection: vi.fn(async () => ({ id: "2" })),
      updateConnection: vi.fn(async () => ({ id: "1" })),
      deleteConnection: vi.fn(async () => undefined),
      getConnection: vi.fn(async () => ({ id: "1" })),
      onDidChangeConnections: vi.fn(() => ({ dispose: vi.fn() }))
    } as unknown as vi.Mocked<ConnectionService>;
    subscriptions = [];
  });

  it("responds to connection:list messages", async () => {
    createConnectionMessageRouter(webview as unknown as vscode.Webview, service, subscriptions);
    await webview.emit({ type: "connection.list" });
    expect(service.listConnections).toHaveBeenCalled();
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "connection.list.result",
      payload: [{ id: "1", name: "Conn" }]
    });
  });

  it("handles create/update/delete messages", async () => {
    createConnectionMessageRouter(webview as unknown as vscode.Webview, service, subscriptions);

    await webview.emit({
      type: "connection.create",
      payload: {
        name: "New",
        driver: "postgres",
        host: "localhost",
        port: 5432,
        database: "postgres"
      }
    });
    expect(service.createConnection).toHaveBeenCalled();

    await webview.emit({
      type: "connection.update",
      payload: {
        id: "1",
        name: "Updated",
        driver: "postgres",
        host: "db",
        port: 5432,
        database: "postgres"
      }
    });
    expect(service.updateConnection).toHaveBeenCalled();

    await webview.emit({
      type: "connection.delete",
      payload: { id: "2" }
    });
    expect(service.deleteConnection).toHaveBeenCalledWith("2");
  });

  it("pushes change notifications to the webview", async () => {
    const disposable = { dispose: vi.fn() };
    service.onDidChangeConnections = vi.fn((listener) => {
      service.listConnections = vi.fn(async () => [
        { id: "3", name: "Realtime" } as any
      ]);
      listener([{ id: "3", name: "Realtime" } as any]);
      return disposable;
    });

    createConnectionMessageRouter(webview as unknown as vscode.Webview, service, subscriptions);
    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: "connection.list.result",
        payload: [{ id: "3", name: "Realtime" }]
      })
    );
    expect(subscriptions).toContain(disposable);
  });
});

