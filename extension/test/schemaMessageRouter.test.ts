import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { createSchemaMessageRouter } from "../src/webview/schemaMessageRouter";
import type { SchemaService } from "../src/services/schemaService";

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

describe("createSchemaMessageRouter", () => {
  let webview: ReturnType<typeof fakeWebview>;
  let schemaService: vi.Mocked<SchemaService>;
  let disposables: vscode.Disposable[];

  beforeEach(() => {
    webview = fakeWebview();
    schemaService = {
      list: vi.fn(),
      getDDL: vi.fn()
    } as unknown as vi.Mocked<SchemaService>;
    disposables = [];
  });

  it("responds with schema list result", async () => {
    schemaService.list.mockResolvedValue([{ name: "public", tables: [] }]);

    createSchemaMessageRouter(webview as unknown as vscode.Webview, schemaService, disposables);

    await webview.emit({
      type: "schema.list",
      payload: { connectionId: "1" }
    });

    expect(schemaService.list).toHaveBeenCalledWith({ connectionId: "1", search: undefined });
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "schema.list.result",
      payload: [{ name: "public", tables: [] }]
    });
  });

  it("returns table DDL", async () => {
    schemaService.getDDL.mockResolvedValue("CREATE TABLE foo");

    createSchemaMessageRouter(webview as unknown as vscode.Webview, schemaService, disposables);

    await webview.emit({
      type: "schema.ddl.get",
      payload: { schema: "public", name: "orders" }
    });

    expect(schemaService.getDDL).toHaveBeenCalledWith({ schema: "public", name: "orders" });
    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "schema.ddl.result",
      payload: {
        schema: "public",
        name: "orders",
        ddl: "CREATE TABLE foo"
      }
    });
  });

  it("reports errors", async () => {
    schemaService.list.mockRejectedValue(new Error("boom"));
    createSchemaMessageRouter(webview as unknown as vscode.Webview, schemaService, disposables);

    await webview.emit({ type: "schema.list" });

    expect(webview.postMessage).toHaveBeenCalledWith({
      type: "schema.list.error",
      error: "boom"
    });
  });
});

