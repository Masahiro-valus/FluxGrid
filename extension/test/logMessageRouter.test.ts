import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogMessageRouter } from "../src/webview/logMessageRouter";
import { LogService } from "../src/services/logService";

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

describe("createLogMessageRouter", () => {
  let webview: ReturnType<typeof fakeWebview>;
  let logService: LogService;
  let disposables: Array<{ dispose: () => void }>;

  beforeEach(() => {
    webview = fakeWebview();
    logService = new LogService();
    disposables = [];
  });

  it("sends existing log entries on subscribe", async () => {
    logService.append({ level: "info", source: "extension", message: "hello" });

    createLogMessageRouter(webview as any, logService, disposables);

    await webview.emit({ type: "log.subscribe" });

    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "log.entries",
          payload: expect.arrayContaining([
            expect.objectContaining({ message: "hello" })
          ])
        })
      )
    );
  });

  it("forwards append events to the webview", async () => {
    createLogMessageRouter(webview as any, logService, disposables);

    logService.append({ level: "warn", source: "core", message: "warned" });

    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "log.entry",
          payload: expect.objectContaining({ message: "warned", source: "core" })
        })
      )
    );
  });

  it("clears log entries when requested", async () => {
    logService.append({ level: "info", source: "extension", message: "hello" });

    createLogMessageRouter(webview as any, logService, disposables);

    await webview.emit({ type: "log.clear" });

    await vi.waitFor(() =>
      expect(webview.postMessage).toHaveBeenCalledWith({ type: "log.cleared" })
    );
    expect(logService.list()).toHaveLength(0);
  });
});

