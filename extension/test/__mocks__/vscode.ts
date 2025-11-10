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

export class EventEmitter<T> {
  private listeners: Array<(event: T) => void> = [];

  event = (listener: (event: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((existing) => existing !== listener);
      }
    };
  };

  fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

