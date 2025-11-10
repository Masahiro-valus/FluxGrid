import { randomUUID } from "crypto";
import * as vscode from "vscode";

export type LogLevel = "info" | "warn" | "error";
export type LogSource = "core" | "extension";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
}

export class LogService {
  private readonly entries: LogEntry[] = [];
  private readonly maxEntries: number;
  private readonly onDidAppendEmitter = new vscode.EventEmitter<LogEntry>();
  private readonly onDidClearEmitter = new vscode.EventEmitter<void>();

  readonly onDidAppend = this.onDidAppendEmitter.event;
  readonly onDidClear = this.onDidClearEmitter.event;

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  list(): LogEntry[] {
    return [...this.entries];
  }

  append(entry: {
    level: LogLevel;
    source: LogSource;
    message: string;
    timestamp?: string;
    id?: string;
  }): void {
    const finalEntry: LogEntry = {
      id: entry.id ?? randomUUID(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      level: entry.level,
      source: entry.source,
      message: entry.message
    };

    this.entries.push(finalEntry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    this.onDidAppendEmitter.fire(finalEntry);
  }

  clear(): void {
    if (this.entries.length === 0) {
      return;
    }
    this.entries.length = 0;
    this.onDidClearEmitter.fire();
  }
}
