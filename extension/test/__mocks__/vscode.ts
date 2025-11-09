import { vi } from "vitest";

export class CancellationError extends Error {}

export class CancellationTokenSource {
  private readonly listeners: Array<() => void> = [];

  token = {
    onCancellationRequested: vi.fn((listener: () => void) => {
      this.listeners.push(listener);
      return { dispose: vi.fn() };
    })
  };

  cancel = vi.fn(() => {
    for (const listener of this.listeners) {
      listener();
    }
  });

  dispose = vi.fn();
}

export const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(() => undefined)
  }))
};

export const window = {
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  setStatusBarMessage: vi.fn()
};

export const commands = {
  registerCommand: vi.fn(() => ({ dispose: vi.fn() }))
};

export const Uri = {
  joinPath: vi.fn((...segments: unknown[]) => segments.join("/"))
};

