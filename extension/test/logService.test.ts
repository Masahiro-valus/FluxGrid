import { describe, expect, it, vi } from "vitest";
import { LogService } from "../src/services/logService";

vi.mock("vscode", () => import("./__mocks__/vscode"));

describe("LogService", () => {
  it("appends entries and enforces max size", () => {
    const service = new LogService(2);

    service.append({ level: "info", source: "extension", message: "first" });
    service.append({ level: "warn", source: "core", message: "second" });
    service.append({ level: "error", source: "core", message: "third" });

    const entries = service.list();
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe("second");
    expect(entries[1].message).toBe("third");
  });

  it("notifies listeners on append and clear", () => {
    const service = new LogService();
    const append = vi.fn();
    const cleared = vi.fn();

    const appendDisposable = service.onDidAppend(append);
    const clearDisposable = service.onDidClear(cleared);

    service.append({ level: "info", source: "extension", message: "hello" });
    expect(append).toHaveBeenCalledTimes(1);

    service.clear();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(service.list()).toHaveLength(0);

    appendDisposable.dispose();
    clearDisposable.dispose();
  });
});

