import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextArea,
  VSCodeTextField,
  VSCodeProgressRing,
  VSCodeCheckbox,
  VSCodeTree,
  VSCodeTreeItem
} from "@vscode/webview-ui-toolkit/react";
import {
  DataEditor,
  GridCellKind,
  type GridColumn,
  type Item,
  type Theme
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import "./QueryEditor.css";
import { useI18n } from "../i18n";
import { ConnectionDialog, type ConnectionFormValue } from "../components/ConnectionDialog";
import { createVscodeBridge, type VscodeBridge } from "../utils/vscode";
import { mockConnections, mockLogs, mockResult, mockSchema } from "../mock/queryEditorMocks";

type ConnectionSummary = {
  id: string;
  name: string;
  driver: string;
};

type QueryExecutionResult = {
  columns?: { name: string; dataType: string }[];
  rows: unknown[][];
  executionTimeMs: number;
};

type QueryLogEntry = {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
};

type SchemaNode = {
  label: string;
  children?: SchemaNode[];
};

type QueryEditorInboundMessage =
  | { type: "connection.list.result"; payload: ConnectionSummary[]; error?: string }
  | { type: "connection.status"; payload: string; tone?: "info" | "error" }
  | { type: "connection.select.result"; payload?: ConnectionFormValue }
  | { type: "connection.test.result"; payload: { ok: boolean; message: string } }
  | { type: "query.execution.started"; payload: { sql: string } }
  | { type: "query.execution.succeeded"; payload: QueryExecutionResult }
  | { type: "query.execution.failed"; error: string }
  | { type: "query.execution.cancelled" }
  | { type: "query.stream.started"; payload: { requestId: string; columns: { name: string; dataType: string }[] } }
  | {
      type: "query.stream.chunk";
      payload: {
        requestId: string;
        rows: unknown[][];
        seq: number;
        hasMore: boolean;
        statistics?: { executionTimeMs?: number; networkLatencyMs?: number };
      };
    }
  | {
      type: "query.stream.complete";
      payload: {
        requestId: string;
        statistics?: { executionTimeMs?: number; totalRows?: number };
        columns?: { name: string; dataType: string }[];
      };
    }
  | { type: "query.stream.error"; payload: { requestId: string; message: string } }
  | { type: "query.log.append"; payload: QueryLogEntry }
  | { type: "schema.list.result"; payload: SchemaNode[] };

interface QueryEditorProps {
  vscodeApi?: VscodeBridge;
}

const MAX_LOG_ENTRIES = 200;

function buildGridTheme(version: number): Theme {
  const root = getComputedStyle(document.documentElement);
  const fallback = (variable: string, defaultValue: string) => {
    const value = root.getPropertyValue(variable);
    return value?.trim() || defaultValue;
  };

  return {
    baseFont: `${fallback("--vscode-font-size", "13px")} ${fallback("--vscode-font-family", "sans-serif")}`,
    baseFontStyle: "normal",
    accentColor: fallback("--vscode-focusBorder", "#0e639c"),
    accentLight: fallback("--vscode-button-secondaryBackground", "#3a3d41"),
    textDark: fallback("--vscode-editor-foreground", "#cccccc"),
    headerFontStyle: "600",
    horizontalBorderColor: fallback("--fg-border-color", "#2a2d2e"),
    verticalBorderColor: fallback("--fg-border-color", "#2a2d2e"),
    bgCell: fallback("--vscode-editor-background", "#1e1e1e"),
    headerBackgroundColor: fallback("--vscode-editorWidget-background", "#252526"),
    headerBottomBorderColor: fallback("--fg-border-color", "#2a2d2e"),
    cellHorizontalPadding: 12,
    cellVerticalPadding: 8,
    lineHeight: 1.4,
    headerIconColor: fallback("--vscode-editor-foreground", "#cccccc"),
    textBubble: fallback("--vscode-editorWidget-background", "#252526"),
    drillDownBorderColor: fallback("--vscode-focusBorder", "#0e639c")
  };
}

const defaultBridge = createVscodeBridge();

export const QueryEditor: React.FC<QueryEditorProps> = ({ vscodeApi = defaultBridge }) => {
  const t = useI18n();
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [sql, setSql] = useState<string>("");
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [logs, setLogs] = useState<QueryLogEntry[]>([]);
  const [status, setStatus] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"info" | "error">("info");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaNode[]>([]);
  const [schemaFilter, setSchemaFilter] = useState<string>("");
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [dialogInitialValue, setDialogInitialValue] = useState<ConnectionFormValue | undefined>();
  const [dialogTestState, setDialogTestState] = useState<"idle" | "pending" | "success" | "error">(
    "idle"
  );
  const [dialogTestMessage, setDialogTestMessage] = useState<string | undefined>();
  const [formatEnabled, setFormatEnabled] = useState<boolean>(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const [logFilter, setLogFilter] = useState<string>("");
  const [activeRequestId, setActiveRequestId] = useState<string | undefined>();

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeVersion((prev) => prev + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"]
    });
    return () => observer.disconnect();
  }, []);

  const gridTheme = useMemo(() => buildGridTheme(themeVersion), [themeVersion]);

  useEffect(() => {
    const unsubscribe = vscodeApi.addMessageListener((message: QueryEditorInboundMessage) => {
      switch (message.type) {
        case "connection.list.result": {
          setConnections(message.payload);
          if (!selectedConnectionId && message.payload.length > 0) {
            setSelectedConnectionId(message.payload[0].id);
          }
          if (message.error) {
            setStatus(message.error);
            setStatusTone("error");
          } else if (message.payload.length > 0) {
            setStatus(t("status.connectionsReady"));
            setStatusTone("info");
          }
          break;
        }
        case "connection.status":
          setStatus(message.payload);
          setStatusTone(message.tone ?? "info");
          break;
        case "connection.select.result":
          if (message.payload) {
            const { options, ...rest } = message.payload;
            setDialogInitialValue({
              ...rest,
              ssl: Boolean(options?.ssl),
              ssh: Boolean(options?.ssh)
            });
          } else {
            setDialogInitialValue(undefined);
          }
          setDialogTestState("idle");
          setDialogTestMessage(undefined);
          setShowConnectionDialog(true);
          break;
        case "connection.test.result":
          setDialogTestState(message.payload.ok ? "success" : "error");
          setDialogTestMessage(message.payload.message);
          break;
        case "query.execution.started":
          setIsExecuting(true);
          setErrorMessage(null);
          setStatus(t("status.queryRunning"));
          setLogs((prev) => [
            ...prev.slice(-MAX_LOG_ENTRIES + 1),
            {
              level: "info",
              message: `Running: ${message.payload.sql.slice(0, 120)}${message.payload.sql.length > 120 ? "…" : ""}`,
              timestamp: new Date().toISOString()
            }
          ]);
          break;
        case "query.execution.succeeded":
          setIsExecuting(false);
          setResult(message.payload);
          setStatus(t("status.querySucceeded", { ms: message.payload.executionTimeMs.toFixed(1) }));
          setStatusTone("info");
          break;
        case "query.execution.failed":
          setIsExecuting(false);
          setErrorMessage(message.error);
          setStatus(t("status.queryFailed"));
          setStatusTone("error");
          setLogs((prev) => [
            ...prev.slice(-MAX_LOG_ENTRIES + 1),
            {
              level: "error",
              message: message.error,
              timestamp: new Date().toISOString()
            }
          ]);
          break;
        case "query.execution.cancelled":
          setIsExecuting(false);
          setStatus(t("status.queryCancelled"));
          setStatusTone("info");
          break;
        case "query.stream.started":
          setActiveRequestId(message.payload.requestId);
          setIsExecuting(true);
          setResult({
            columns: message.payload.columns,
            rows: [],
            executionTimeMs: 0
          });
          setStatus(t("status.queryRunning"));
          setStatusTone("info");
          break;
        case "query.stream.chunk":
          if (message.payload.requestId !== activeRequestId) {
            break;
          }
          let mergedCount = 0;
          setResult((prev) => {
            const columns = prev?.columns ?? [];
            const rows = prev?.rows ?? [];
            const merged = [...rows, ...message.payload.rows];
            mergedCount = merged.length;
            return {
              columns,
              rows: merged,
              executionTimeMs: prev?.executionTimeMs ?? 0
            };
          });
          setLogs((prev) => [
            ...prev.slice(-MAX_LOG_ENTRIES + 1),
            {
              level: "info",
              message: `Chunk ${message.payload.seq} (${message.payload.rows.length} rows)`,
              timestamp: new Date().toISOString()
            }
          ]);
          setStatus(t("results.rowCount", { count: mergedCount }));
          setStatusTone("info");
          break;
        case "query.stream.complete":
          if (message.payload.requestId !== activeRequestId) {
            break;
          }
          setIsExecuting(false);
          setActiveRequestId(undefined);
          setResult((prev) => {
            const columns =
              message.payload.columns ?? prev?.columns ?? [];
            const rows = prev?.rows ?? [];
            return {
              columns,
              rows,
              executionTimeMs:
                message.payload.statistics?.executionTimeMs ?? prev?.executionTimeMs ?? 0
            };
          });
          setStatus(
            message.payload.statistics?.executionTimeMs
              ? t("status.querySucceeded", {
                  ms: message.payload.statistics.executionTimeMs.toFixed(1)
                })
              : t("status.querySucceeded", { ms: "0.0" })
          );
          setStatusTone("info");
          break;
        case "query.stream.error":
          if (message.payload.requestId !== activeRequestId) {
            break;
          }
          setIsExecuting(false);
          setActiveRequestId(undefined);
          setErrorMessage(message.payload.message);
          setStatus(t("status.queryFailed"));
          setStatusTone("error");
          setLogs((prev) => [
            ...prev.slice(-MAX_LOG_ENTRIES + 1),
            {
              level: "error",
              message: message.payload.message,
              timestamp: new Date().toISOString()
            }
          ]);
          break;
        case "query.log.append":
          setLogs((prev) => [...prev.slice(-MAX_LOG_ENTRIES + 1), message.payload]);
          break;
        case "schema.list.result":
          setSchema(message.payload);
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, [vscodeApi, selectedConnectionId, t, activeRequestId, result]);

  useEffect(() => {
    vscodeApi.postMessage({ type: "connection.list" });
  }, [vscodeApi]);

  useEffect(() => {
    if (typeof acquireVsCodeApi !== "function") {
      setConnections(mockConnections);
      setSelectedConnectionId(mockConnections[0]?.id);
      setResult(mockResult);
      setSchema(mockSchema);
      setLogs(mockLogs);
      setStatus("Loaded mock data.");
    }
  }, []);

  const handleRun = useCallback(() => {
    if (!sql.trim()) {
      setStatus(t("editor.emptyState"));
      setStatusTone("error");
      return;
    }
    setDialogTestState("idle");
    vscodeApi.postMessage({
      type: "query.run",
      payload: {
        sql,
        connectionId: selectedConnectionId,
        options: { timeoutSeconds }
      }
    });
  }, [sql, selectedConnectionId, timeoutSeconds, vscodeApi, t]);

  const handleCancel = useCallback(() => {
    vscodeApi.postMessage({ type: "query.cancel" });
  }, [vscodeApi]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleRun();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (isExecuting) {
          handleCancel();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleRun, handleCancel, isExecuting]);

  const columns: GridColumn[] = useMemo(() => {
    if (!result?.columns) {
      return [];
    }
    return result.columns.map((column) => ({
      id: column.name,
      title: column.name,
      grow: 1
    }));
  }, [result]);

  const getCellContent = useCallback(
    (cell: Item) => {
      const [columnIndex, rowIndex] = cell;
      const value = result?.rows?.[rowIndex]?.[columnIndex];
      const display =
        value === null || value === undefined
          ? "NULL"
          : typeof value === "string"
            ? value
            : JSON.stringify(value);
      return {
        kind: GridCellKind.Text,
        displayData: display,
        data: display,
        allowOverlay: true
      };
    },
    [result]
  );

  const rowCount = result?.rows?.length ?? 0;

  const filteredLogs = useMemo(() => {
    if (!logFilter.trim()) {
      return logs;
    }
    const keyword = logFilter.toLowerCase();
    return logs.filter(
      (entry) =>
        entry.message.toLowerCase().includes(keyword) || entry.level.toLowerCase().includes(keyword)
    );
  }, [logs, logFilter]);

  const filteredSchema = useMemo(() => {
    if (!schemaFilter.trim()) {
      return schema;
    }
    const keyword = schemaFilter.toLowerCase();
    const filterNodes = (nodes: SchemaNode[]): SchemaNode[] =>
      nodes
        .map((node) => {
          if (!node.children) {
            return node.label.toLowerCase().includes(keyword) ? node : null;
          }
          const children = filterNodes(node.children);
          if (children.length > 0 || node.label.toLowerCase().includes(keyword)) {
            return { ...node, children };
          }
          return null;
        })
        .filter(Boolean) as SchemaNode[];
    return filterNodes(schema);
  }, [schema, schemaFilter]);

  const handleSchemaItemClick = (label: string) => {
    setSql((current) => `${current}\nSELECT * FROM ${label} LIMIT 100;`.trimStart());
    setStatus(`Prepared SELECT from ${label}`);
    setStatusTone("info");
  };

  const handleOpenConnectionDialog = () => {
    setDialogTestState("idle");
    setDialogTestMessage(undefined);
    if (selectedConnectionId) {
      vscodeApi.postMessage({
        type: "connection.select",
        payload: { id: selectedConnectionId }
      });
    } else {
      setDialogInitialValue(undefined);
      setShowConnectionDialog(true);
    }
  };

  const handleSaveConnection = (value: ConnectionFormValue) => {
    setShowConnectionDialog(false);
    const { ssl, ssh, ...rest } = value;
    vscodeApi.postMessage({
      type: value.id ? "connection.update" : "connection.create",
      payload: {
        ...rest,
        options: { ssl, ssh }
      }
    });
  };

  const handleTestConnection = (value: ConnectionFormValue) => {
    setDialogTestState("pending");
    setDialogTestMessage(undefined);
    const { ssl, ssh, ...rest } = value;
    vscodeApi.postMessage({
      type: "connection.test",
      payload: {
        ...rest,
        options: { ssl, ssh }
      }
    });
  };

  return (
    <main className="fg-app" aria-label="FluxGrid query workspace">
      <div className="fg-toolbar" role="toolbar" aria-label="Query toolbar">
        <div className="fg-toolbar__group">
          <label htmlFor="fg-connection-select">{t("toolbar.connectionLabel")}</label>
          <VSCodeDropdown
            id="fg-connection-select"
            value={selectedConnectionId ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const value = event.target.value;
              setSelectedConnectionId(value);
            }}
            aria-label={t("toolbar.connectionLabel")}
          >
            {connections.map((connection) => (
              <VSCodeOption key={connection.id} value={connection.id}>
                {connection.name}
              </VSCodeOption>
            ))}
            {connections.length === 0 && <VSCodeOption value="">{t("schema.empty")}</VSCodeOption>}
          </VSCodeDropdown>
          <VSCodeButton appearance="secondary" onClick={handleOpenConnectionDialog}>
            {t("toolbar.openConnectionDialog")}
          </VSCodeButton>
        </div>

        <div className="fg-toolbar__group">
          <VSCodeButton appearance="primary" onClick={handleRun} disabled={isExecuting}>
            {t("toolbar.run")}
          </VSCodeButton>
          <VSCodeButton appearance="secondary" onClick={handleCancel} disabled={!isExecuting}>
            {t("toolbar.stop")}
          </VSCodeButton>
        </div>

        <div className="fg-toolbar__group">
          <VSCodeTextField
            className="fg-toolbar__timeout"
            value={timeoutSeconds}
            type="number"
            min={1}
            aria-label={t("toolbar.timeout")}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) => {
              const next = Number.parseInt(event.target.value, 10);
              setTimeoutSeconds(Number.isNaN(next) ? 30 : next);
            }}
          >
            {t("toolbar.timeout")}
          </VSCodeTextField>
          <VSCodeCheckbox
            checked={formatEnabled}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setFormatEnabled(event.target.checked)
            }
          >
            {t("toolbar.format")}
          </VSCodeCheckbox>
        </div>

        <div className="fg-toolbar__spacer" />
        <div className="fg-status" role="status" aria-live="polite" data-tone={statusTone}>
          {status}
        </div>
      </div>

      {errorMessage && <div className="fg-error-banner">{errorMessage}</div>}

      <div className="fg-layout">
        <section className="fg-pane" aria-label={t("schema.title")}>
          <div className="fg-pane__header">
            <h2 className="fg-pane__title">{t("schema.title")}</h2>
          </div>
          <VSCodeTextField
            className="fg-schema-search"
            placeholder={t("schema.searchPlaceholder")}
            value={schemaFilter}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
              setSchemaFilter(event.target.value)
            }
            aria-label={t("schema.searchPlaceholder")}
          />
          <div className="fg-schema-tree" role="tree">
            <VSCodeTree>
              {filteredSchema.length === 0 && <span>{t("schema.empty")}</span>}
              {filteredSchema.map((node) => (
                <SchemaTreeItem key={node.label} node={node} onSelect={handleSchemaItemClick} />
              ))}
            </VSCodeTree>
          </div>
        </section>

        <section className="fg-pane fg-editor-pane">
          <div className="fg-sql-editor">
            <VSCodeTextArea
              resize="vertical"
              value={sql}
              onInput={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setSql(event.target.value)
              }
              placeholder={t("editor.placeholder")}
              aria-label={t("editor.placeholder")}
            />
            <div className="fg-sql-shortcuts">Cmd/Ctrl + Enter · Esc</div>
          </div>
          <div className="fg-results">
            <header className="fg-pane__header">
              <h2 className="fg-pane__title">{t("results.title")}</h2>
              {rowCount > 0 && (
                <span className="fg-row-count">{t("results.rowCount", { count: rowCount })}</span>
              )}
            </header>
            <div className="fg-results__grid">
              {result && columns.length > 0 ? (
                <DataEditor
                  getCellContent={getCellContent}
                  columns={columns}
                  rows={rowCount}
                  rowHeight={32}
                  smoothScrollX
                  smoothScrollY
                  freezeColumns={1}
                  theme={gridTheme}
                />
              ) : (
                <div className="fg-results__empty">
                  <p>{isExecuting ? t("results.loading") : t("results.empty")}</p>
                  {!isExecuting && (
                    <VSCodeButton appearance="secondary" onClick={handleRun}>
                      {t("editor.retry")}
                    </VSCodeButton>
                  )}
                </div>
              )}
              {isExecuting && (
                <div className="fg-results__overlay" aria-live="polite">
                  <VSCodeProgressRing />
                  <span>{t("results.loading")}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="fg-pane" aria-label={t("logging.title")}>
          <div className="fg-pane__header">
            <h2 className="fg-pane__title">{t("logging.title")}</h2>
          </div>
          <VSCodeTextField
            placeholder={t("logs.filterPlaceholder")}
            value={logFilter}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
              setLogFilter(event.target.value)
            }
            aria-label={t("logs.filterPlaceholder")}
          />
          <div className="fg-log-list">
            {filteredLogs.length === 0 && <span>{t("logging.empty")}</span>}
            {filteredLogs.map((entry, index) => (
              <article
                key={`${entry.timestamp}-${index}`}
                className="fg-log-entry"
                data-level={entry.level}
              >
                <span className="fg-log-entry__timestamp">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span>{entry.message}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <ConnectionDialog
        open={showConnectionDialog}
        initialValue={dialogInitialValue}
        testState={dialogTestState}
        testMessage={dialogTestMessage}
        onSaved={handleSaveConnection}
        onTest={handleTestConnection}
        onClose={() => setShowConnectionDialog(false)}
      />
    </main>
  );
};

interface SchemaTreeItemProps {
  node: SchemaNode;
  onSelect: (label: string) => void;
}

const SchemaTreeItem: React.FC<SchemaTreeItemProps> = ({ node, onSelect }) => {
  if (!node.children || node.children.length === 0) {
    return (
      <VSCodeTreeItem
        id={node.label}
        onClick={() => onSelect(node.label)}
        data-name={node.label}
        aria-label={node.label}
      >
        {node.label}
      </VSCodeTreeItem>
    );
  }
  return (
    <VSCodeTreeItem id={node.label} aria-label={node.label}>
      {node.label}
      {node.children.map((child) => (
        <SchemaTreeItem key={`${node.label}/${child.label}`} node={child} onSelect={onSelect} />
      ))}
    </VSCodeTreeItem>
  );
};
