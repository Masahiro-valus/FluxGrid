import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id?: number | string;
  result?: T;
  error?: JsonRpcError;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  id?: number | string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export class CoreClient implements vscode.Disposable {
  private process: cp.ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private buffer = "";
  private nextRequestId = 1;
  private readonly notificationListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const binaryPath = await this.resolveBinaryPath();

    await new Promise<void>((resolve, reject) => {
      try {
        this.process = cp.spawn(binaryPath, ["--stdio"], {
          cwd: path.dirname(binaryPath),
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        reject(error);
        return;
      }

      if (!this.process || !this.process.stdout || !this.process.stdin) {
        reject(new Error("Failed to launch Core Engine."));
        return;
      }

      this.process.stdout.on("data", (chunk: Buffer) => {
        this.buffer += chunk.toString("utf8");
        this.flushBuffer();
      });

      this.process.stderr.on("data", (chunk: Buffer) => {
        const message = chunk.toString("utf8");
        console.error(`[FluxGrid Core stderr] ${message}`);
        vscode.window.showWarningMessage(`Core Engine: ${message}`);
      });

      this.process.on("error", (err) => {
        this.dispose();
        reject(err);
      });

      this.process.on("exit", (code, signal) => {
        this.dispose();
        const reason = code !== null ? `code ${code}` : `signal ${signal}`;
        vscode.window.showWarningMessage(`Core Engine exited (${reason})`);
      });

      resolve();
    });
  }

  async sendRequest<T = unknown>(
    method: string,
    params?: unknown,
    token?: vscode.CancellationToken
  ): Promise<T> {
    if (!this.process || !this.process.stdin) {
      throw new Error("Core Engine is not running.");
    }

    const id = this.nextRequestId++;
    const requestId = id.toString();
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id
    };

    const serialized = JSON.stringify(payload);

    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject
      });
    });

    if (token) {
      token.onCancellationRequested(() => {
        this.sendNotification("query.cancel", { requestId: id }).catch((err) => {
          console.error("Cancel notification failed", err);
        });
      });
    }

    this.process.stdin.write(`${serialized}\n`, "utf8");
    return result;
  }

  async sendNotification(method: string, params?: unknown): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error("Core Engine is not running.");
    }

    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params
    };

    this.process.stdin.write(`${JSON.stringify(payload)}\n`, "utf8");
  }

  dispose(): void {
    for (const [, handlers] of this.pending) {
      handlers.reject(new Error("Core Engine has stopped."));
    }
    this.pending.clear();

    if (this.process) {
      this.process.kill();
      this.process.removeAllListeners();
    }

    this.process = undefined;
    this.buffer = "";
  }

  private flushBuffer(): void {
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const raw = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (raw.length > 0) {
        this.handleMessage(raw);
      }

      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw) as JsonRpcResponse | JsonRpcNotification;
      if (typeof (message as JsonRpcResponse).id !== "undefined") {
        const response = message as JsonRpcResponse;
        const responseId = String(response.id);
        const pending = this.pending.get(responseId);
        if (!pending) {
          return;
        }

        this.pending.delete(responseId);

        if (response.error) {
          pending.reject(new Error(response.error.message));
          return;
        }

        pending.resolve(response.result);
        return;
      }

      if ("method" in message) {
        this.handleNotification(message as JsonRpcNotification);
      }
    } catch (error) {
      console.error("Failed to parse JSON-RPC message", error);
    }
  }

  private handleNotification(message: JsonRpcNotification): void {
    const listeners = this.notificationListeners.get(message.method);
    if (!listeners || listeners.size === 0) {
      return;
    }
    for (const listener of listeners) {
      try {
        listener(message.params);
      } catch (error) {
        console.error(`CoreClient notification listener error for ${message.method}`, error);
      }
    }
  }

  onNotification(method: string, listener: (params: unknown) => void): vscode.Disposable {
    let listeners = this.notificationListeners.get(method);
    if (!listeners) {
      listeners = new Set();
      this.notificationListeners.set(method, listeners);
    }
    listeners.add(listener);

    return {
      dispose: () => {
        const current = this.notificationListeners.get(method);
        if (!current) {
          return;
        }
        current.delete(listener);
        if (current.size === 0) {
          this.notificationListeners.delete(method);
        }
      }
    };
  }

  private async resolveBinaryPath(): Promise<string> {
    const configured = vscode.workspace.getConfiguration("fluxgrid.core").get<string>("path");
    if (configured) {
      return configured;
    }

    const binaryName = process.platform === "win32" ? "core.exe" : "core";
    const bundled = path.join(this.context.extensionPath, "..", "core", "bin", binaryName);

    return bundled;
  }
}
