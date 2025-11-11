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
  GridColumnIcon,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import "./QueryEditor.css";
import { useI18n } from "../i18n";
import { ConnectionDialog, type ConnectionFormValue } from "../components/ConnectionDialog";
import { createVscodeBridge, type VscodeBridge } from "../utils/vscode";
import {
  mockConnections,
  mockLogs,
  mockResult,
  mockSchema,
  mockDdl
} from "../mock/queryEditorMocks";
import {
  buildClipboardText,
  estimateColumnWidth,
  formatCellValue,
  type GridSelectionRange
} from "../utils/resultGrid";

const makeTableId = (schema: string, table: string) => `${schema}.${table}`;

const NUMERIC_TYPE_PATTERN = /int|numeric|decimal|double|float|real|money/i;
const BOOLEAN_TYPE_PATTERN = /bool/i;
const DATETIME_TYPE_PATTERN = /timestamp|date|time/i;

function pickColumnIcon(dataType: string): GridColumnIcon {
  if (NUMERIC_TYPE_PATTERN.test(dataType)) {
    return GridColumnIcon.HeaderNumber;
  }
  if (BOOLEAN_TYPE_PATTERN.test(dataType)) {
    return GridColumnIcon.HeaderBoolean;
  }
  if (DATETIME_TYPE_PATTERN.test(dataType)) {
    return GridColumnIcon.HeaderCode;
  }
  return GridColumnIcon.HeaderString;
}

function isRightAligned(dataType: string): boolean {
  return NUMERIC_TYPE_PATTERN.test(dataType);
}

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

type DeveloperLogEntry = {
  id: string;
  level: "info" | "warn" | "error";
  source: "core" | "extension";
  message: string;
  timestamp: string;
};

type SchemaColumn = {
  name: string;
  dataType: string;
  notNull: boolean;
};

type SchemaTable = {
  name: string;
  type: string;
  columns: SchemaColumn[];
};

type SchemaEntry = {
  name: string;
  tables: SchemaTable[];
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
  | { type: "log.entries"; payload: DeveloperLogEntry[] }
  | { type: "log.entry"; payload: DeveloperLogEntry }
  | { type: "log.cleared" }
  | { type: "schema.list.result"; payload: SchemaEntry[] }
  | { type: "schema.list.error"; error: string }
  | {
      type: "schema.ddl.result";
      payload: { schema: string; name: string; ddl: string };
    }
  | { type: "schema.ddl.error"; error: string }
  | { type: "clipboard.write.result"; payload: { ok: boolean; message?: string } };

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
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [gridSelection, setGridSelection] = useState<GridSelection | undefined>();
  const [isGridFocused, setIsGridFocused] = useState(false);
  const [logs, setLogs] = useState<DeveloperLogEntry[]>([]);
  const [status, setStatus] = useState<string>("");
  const [statusTone, setStatusTone] = useState<"info" | "error">("info");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<SchemaEntry[]>([]);
  const [schemaSearch, setSchemaSearch] = useState<string>("");
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<{
    schema: string;
    table: SchemaTable;
  } | null>(null);
  const [ddl, setDdl] = useState<string>("");
  const [ddlLoading, setDdlLoading] = useState(false);
  const [ddlError, setDdlError] = useState<string | null>(null);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [dialogInitialValue, setDialogInitialValue] = useState<ConnectionFormValue | undefined>();
  const [dialogTestState, setDialogTestState] = useState<"idle" | "pending" | "success" | "error">(
    "idle"
  );
  const [dialogTestMessage, setDialogTestMessage] = useState<string | undefined>();
  const [formatEnabled, setFormatEnabled] = useState<boolean>(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const [logFilter, setLogFilter] = useState<string>("");
  const [logLevelFilter, setLogLevelFilter] = useState<"all" | "info" | "warn" | "error">("all");
  const [logSourceFilter, setLogSourceFilter] = useState<"all" | "core" | "extension">("all");
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
          setGridSelection(undefined);
          setIsExecuting(true);
          setErrorMessage(null);
          setStatus(t("status.queryRunning"));
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
          setGridSelection(undefined);
          break;
        case "query.execution.cancelled":
          setIsExecuting(false);
          setStatus(t("status.queryCancelled"));
          setStatusTone("info");
          setGridSelection(undefined);
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
          break;
        case "log.entries":
          setLogs(message.payload.slice(-MAX_LOG_ENTRIES));
          break;
        case "log.entry":
          setLogs((prev) => [...prev.slice(-MAX_LOG_ENTRIES + 1), message.payload]);
          break;
        case "log.cleared":
          setLogs([]);
          break;
        case "schema.list.result":
          setSchemaLoading(false);
          setSchemas(message.payload);
          setStatus(
            message.payload.length
              ? t("schema.title")
              : t("schema.empty")
          );
          setStatusTone("info");
          break;
        case "schema.list.error":
          setSchemaLoading(false);
          setSchemas([]);
          setStatus(message.error);
          setStatusTone("error");
          break;
        case "schema.ddl.result":
          if (
            selectedTable &&
            selectedTable.schema === message.payload.schema &&
            selectedTable.table.name === message.payload.name
          ) {
            setDdl(message.payload.ddl);
            setDdlError(null);
            setDdlLoading(false);
          }
          break;
        case "schema.ddl.error":
          setDdl("");
          setDdlLoading(false);
          setDdlError(message.error);
          break;
        case "clipboard.write.result":
          if (message.payload.ok) {
            setStatus(t("results.copySuccess"));
            setStatusTone("info");
          } else {
            setStatus(message.payload.message ?? t("results.copyFailed"));
            setStatusTone("error");
          }
          break;
        default:
          break;
      }
    });

    return unsubscribe;
  }, [vscodeApi, selectedConnectionId, t, activeRequestId, selectedTable]);

  useEffect(() => {
    vscodeApi.postMessage({ type: "connection.list" });
    vscodeApi.postMessage({ type: "log.subscribe" });
  }, [vscodeApi]);

  useEffect(() => {
    if (typeof acquireVsCodeApi !== "function") {
      setConnections(mockConnections);
      setSelectedConnectionId(mockConnections[0]?.id);
      setResult(mockResult);
      setSchemas(mockSchema);
      setSchemaLoading(false);
      setExpandedSchemas(new Set(mockSchema.map((entry) => entry.name)));
      setExpandedTables(
        new Set(
          mockSchema.flatMap((entry) =>
            entry.tables.map((table) => makeTableId(entry.name, table.name))
          )
        )
      );
      const firstSchema = mockSchema[0];
      const firstTable = firstSchema?.tables[0];
      if (firstSchema && firstTable) {
        setSelectedTable({ schema: firstSchema.name, table: firstTable });
        setDdl(mockDdl);
      }
      setDdlLoading(false);
      setLogs(mockLogs);
      setStatus("Loaded mock data.");
    }
  }, []);

  useEffect(() => {
    if (!result?.columns) {
      setColumnWidths({});
      return;
    }

    const sampleRows = result.rows ?? [];
    setColumnWidths((prev) => {
      const next: Record<string, number> = {};
      let changed = false;

      result.columns.forEach((column, index) => {
        if (typeof prev[column.name] === "number") {
          next[column.name] = prev[column.name];
        } else {
          next[column.name] = estimateColumnWidth({
            column,
            rows: sampleRows,
            columnIndex: index
          });
          changed = true;
        }
      });

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      if (!changed) {
        for (const key of Object.keys(next)) {
          if (prev[key] !== next[key]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [result]);

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

  const handleLogLevelChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setLogLevelFilter(event.target.value as "all" | "info" | "warn" | "error");
    },
    []
  );

  const handleLogSourceChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setLogSourceFilter(event.target.value as "all" | "core" | "extension");
    },
    []
  );

  const handleClearLogs = useCallback(() => {
    setLogFilter("");
    vscodeApi.postMessage({ type: "log.clear" });
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

  useEffect(() => {
    if (typeof acquireVsCodeApi !== "function") {
      return;
    }
    setSchemaLoading(true);
    const connectionId = selectedConnectionId ?? undefined;
    const handle = window.setTimeout(() => {
      vscodeApi.postMessage({
        type: "schema.list",
        payload: {
          connectionId,
          search: schemaSearch.trim() ? schemaSearch.trim() : undefined
        }
      });
    }, 200);

    return () => {
      window.clearTimeout(handle);
    };
  }, [selectedConnectionId, schemaSearch, vscodeApi]);

  const columns: GridColumn[] = useMemo(() => {
    if (!result?.columns) {
      return [];
    }
    const sampleRows = result.rows ?? [];
    return result.columns.map((column, index) => {
      const width = columnWidths[column.name] ??
        estimateColumnWidth({ column, rows: sampleRows, columnIndex: index });
      return {
        id: column.name,
        title: column.name,
        width,
        grow: 1,
        icon: pickColumnIcon(column.dataType),
        hasMenu: true
      };
    });
  }, [result, columnWidths]);

  const columnDataTypes = useMemo(() => result?.columns?.map((column) => column.dataType) ?? [], [result]);

  const getCellContent = useCallback(
    (cell: Item) => {
      const [columnIndex, rowIndex] = cell;
      const value = result?.rows?.[rowIndex]?.[columnIndex];
      const text = formatCellValue(value);
      const dataType = columnDataTypes[columnIndex] ?? "";
      return {
        kind: GridCellKind.Text,
        displayData: text,
        data: text,
        allowOverlay: text.length > 64,
        copyData: text,
        contentAlign: isRightAligned(dataType) ? "right" : "left"
      };
    },
    [result, columnDataTypes]
  );

  const rowCount = result?.rows?.length ?? 0;

  const selectionToRanges = useCallback(
    (selection: GridSelection | undefined): GridSelectionRange[] => {
      if (!selection) {
        return [];
      }
      const totalColumns = result?.columns?.length ?? 0;
      const totalRows = rowCount;
      const ranges: GridSelectionRange[] = [];
      const seen = new Set<string>();

      const pushRange = (rect?: { x: number; y: number; width: number; height: number }) => {
        if (!rect) {
          return;
        }
        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }
        const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        ranges.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        });
      };

      if (selection.current) {
        pushRange(selection.current.range);
        const stack = selection.current.rangeStack ?? [];
        for (const rect of stack) {
          pushRange(rect);
        }
      }

      const toGroups = (indices: number[]): Array<{ start: number; end: number }> => {
        if (indices.length === 0) {
          return [];
        }
        const sorted = [...indices].sort((a, b) => a - b);
        const groups: Array<{ start: number; end: number }> = [];
        let start = sorted[0];
        let end = sorted[0];
        for (let i = 1; i < sorted.length; i += 1) {
          const value = sorted[i];
          if (value === end + 1) {
            end = value;
          } else {
            groups.push({ start, end });
            start = value;
            end = value;
          }
        }
        groups.push({ start, end });
        return groups;
      };

      if (selection.rows && totalColumns > 0) {
        const rowIndices = Array.from(selection.rows);
        const groups = toGroups(rowIndices);
        for (const group of groups) {
          pushRange({
            x: 0,
            y: group.start,
            width: totalColumns,
            height: group.end - group.start + 1
          });
        }
      }

      if (selection.columns && totalRows > 0) {
        const columnIndices = Array.from(selection.columns);
        const groups = toGroups(columnIndices);
        for (const group of groups) {
          pushRange({
            x: group.start,
            y: 0,
            width: group.end - group.start + 1,
            height: totalRows
          });
        }
      }

      return ranges;
    },
    [result, rowCount]
  );

  const filteredLogs = useMemo(() => {
    const keyword = logFilter.trim().toLowerCase();
    return logs.filter((entry) => {
      const matchesKeyword =
        !keyword ||
        entry.message.toLowerCase().includes(keyword) ||
        entry.level.toLowerCase().includes(keyword) ||
        entry.source.toLowerCase().includes(keyword);
      const matchesLevel = logLevelFilter === "all" || entry.level === logLevelFilter;
      const matchesSource = logSourceFilter === "all" || entry.source === logSourceFilter;
      return matchesKeyword && matchesLevel && matchesSource;
    });
  }, [logs, logFilter, logLevelFilter, logSourceFilter]);

  const filteredSchemas = useMemo(() => {
    const keyword = schemaSearch.trim().toLowerCase();
    if (!keyword) {
      return schemas;
    }
    return schemas
      .map((entry) => {
        const schemaMatch = entry.name.toLowerCase().includes(keyword);
        const tables = entry.tables
          .map((table) => {
            const tableMatch = table.name.toLowerCase().includes(keyword);
            const columns = table.columns.filter((column) => {
              const columnName = column.name.toLowerCase();
              return (
                columnName.includes(keyword) ||
                column.dataType.toLowerCase().includes(keyword)
              );
            });
            if (tableMatch) {
              return table;
            }
            if (columns.length > 0) {
              return {
                ...table,
                columns
              };
            }
            return null;
          })
          .filter((table): table is SchemaTable => table !== null);

        if (schemaMatch) {
          return entry;
        }
        if (tables.length > 0) {
          return {
            name: entry.name,
            tables
          };
        }
        return null;
      })
      .filter((entry): entry is SchemaEntry => entry !== null);
  }, [schemas, schemaSearch]);

  const selectedTableId = useMemo(() => {
    if (!selectedTable) {
      return null;
    }
    return makeTableId(selectedTable.schema, selectedTable.table.name);
  }, [selectedTable]);

  const toggleSchema = useCallback((schemaName: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaName)) {
        next.delete(schemaName);
      } else {
        next.add(schemaName);
      }
      return next;
    });
  }, []);

  const toggleTable = useCallback((schemaName: string, tableName: string) => {
    const id = makeTableId(schemaName, tableName);
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectTable = useCallback(
    (schemaName: string, table: SchemaTable) => {
      setExpandedSchemas((prev) => new Set(prev).add(schemaName));
      setExpandedTables((prev) => new Set(prev).add(makeTableId(schemaName, table.name)));
      setSelectedTable({ schema: schemaName, table });
      setDdl("");
      setDdlError(null);
      setDdlLoading(true);

      if (typeof acquireVsCodeApi !== "function") {
        setDdl(mockDdl);
        setDdlLoading(false);
        return;
      }

      vscodeApi.postMessage({
        type: "schema.ddl.get",
        payload: {
          connectionId: selectedConnectionId,
          schema: schemaName,
          name: table.name
        }
      });
    },
    [selectedConnectionId, vscodeApi]
  );

  const handleInsertQuery = useCallback(
    (schemaName: string, table: SchemaTable) => {
      setSql((current) =>
        `${current}\nSELECT * FROM ${schemaName}.${table.name} LIMIT 100;`.trimStart()
      );
      setStatus(t("schema.queryPrepared", { table: `${schemaName}.${table.name}` }));
      setStatusTone("info");
    },
    [setSql, setStatus, setStatusTone, t]
  );

  useEffect(() => {
    setExpandedSchemas((prev) => {
      const next = new Set<string>();
      schemas.forEach((entry) => {
        if (prev.has(entry.name)) {
          next.add(entry.name);
        }
      });
      return next;
    });
    setExpandedTables((prev) => {
      const next = new Set<string>();
      schemas.forEach((entry) => {
        entry.tables.forEach((table) => {
          const id = makeTableId(entry.name, table.name);
          if (prev.has(id)) {
            next.add(id);
          }
        });
      });
      return next;
    });

    if (selectedTable) {
      const stillExists = schemas.some(
        (entry) =>
          entry.name === selectedTable.schema &&
          entry.tables.some((table) => table.name === selectedTable.table.name)
      );
      if (!stillExists) {
        setSelectedTable(null);
        setDdl("");
        setDdlError(null);
      }
    }
  }, [schemas, selectedTable]);

  useEffect(() => {
    if (!schemaSearch.trim()) {
      return;
    }
    const keyword = schemaSearch.trim().toLowerCase();
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      filteredSchemas.forEach((entry) => next.add(entry.name));
      return next;
    });
    setExpandedTables((prev) => {
      const next = new Set(prev);
      filteredSchemas.forEach((entry) => {
        entry.tables.forEach((table) => {
          if (
            table.name.toLowerCase().includes(keyword) ||
            table.columns.some((column) => column.name.toLowerCase().includes(keyword))
          ) {
            next.add(makeTableId(entry.name, table.name));
          }
        });
      });
      return next;
    });
  }, [schemaSearch, filteredSchemas]);

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

  const copySelectionToClipboard = useCallback(async () => {
    if (!result?.columns || !result.rows || result.columns.length === 0) {
      setStatus(t("results.noData"));
      setStatusTone("error");
      return;
    }
    if (!gridSelection) {
      setStatus(t("results.noSelection"));
      setStatusTone("error");
      return;
    }
    const ranges = selectionToRanges(gridSelection);
    if (ranges.length === 0) {
      setStatus(t("results.noSelection"));
      setStatusTone("error");
      return;
    }

    const totalColumns = result.columns.length;
    const includeHeaders = totalColumns > 0 &&
      (ranges.some((range) => range.width >= totalColumns) ||
        (gridSelection.columns?.length ?? 0) > 0);

    const text = buildClipboardText({
      columns: result.columns,
      rows: result.rows,
      selections: ranges,
      includeHeaders
    });

    if (!text) {
      setStatus(t("results.noSelection"));
      setStatusTone("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus(t("results.copySuccess"));
      setStatusTone("info");
    } catch {
      setStatus(t("results.copyInProgress"));
      setStatusTone("info");
      vscodeApi.postMessage({
        type: "clipboard.write",
        payload: { text }
      } as { type: string; payload: { text: string } });
    }
  }, [gridSelection, result, selectionToRanges, t, vscodeApi]);

  const handleColumnResize = useCallback((column: GridColumn, newSize: number) => {
    const key = column.id ?? column.title;
    if (!key) {
      return;
    }
    setColumnWidths((prev) => {
      if (prev[key] === newSize) {
        return prev;
      }
      return { ...prev, [key]: newSize };
    });
  }, []);

  useEffect(() => {
    if (!isGridFocused) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelectionToClipboard();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isGridFocused, copySelectionToClipboard]);

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
        <section className="fg-pane fg-schema-pane" aria-label={t("schema.title")}>
          <div className="fg-pane__header">
            <h2 className="fg-pane__title">{t("schema.title")}</h2>
          </div>
          <VSCodeTextField
            className="fg-schema-search"
            placeholder={t("schema.searchPlaceholder")}
            value={schemaSearch}
            onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
              setSchemaSearch(event.target.value)
            }
            aria-label={t("schema.searchPlaceholder")}
          />
          <div className="fg-schema-content">
            <div className="fg-schema-tree" role="tree">
              {schemaLoading && (
                <div className="fg-schema-loading">
                  <VSCodeProgressRing />
                </div>
              )}
              <SchemaTree
                schemas={filteredSchemas}
                expandedSchemas={expandedSchemas}
                expandedTables={expandedTables}
                selectedTableId={selectedTableId}
                onToggleSchema={toggleSchema}
                onToggleTable={toggleTable}
                onSelectTable={handleSelectTable}
                onInsertQuery={handleInsertQuery}
                emptyMessage={t("schema.empty")}
              />
            </div>
            <div className="fg-schema-detail">
              {selectedTable ? (
                <>
                  <header className="fg-schema-detail-header">
                    <h3>
                      {selectedTable.schema}.{selectedTable.table.name}
                    </h3>
                    <span className="fg-schema-detail-type">
                      {t("schema.detailType", { type: selectedTable.table.type })}
                    </span>
                  </header>
                  <div className="fg-schema-columns">
                    <h4>{t("schema.detailColumns")}</h4>
                    {selectedTable.table.columns.length === 0 ? (
                      <p>{t("schema.detailNoColumns")}</p>
                    ) : (
                      <table>
                        <thead>
                          <tr>
                            <th>{t("schema.columnName")}</th>
                            <th>{t("schema.columnType")}</th>
                            <th>{t("schema.columnNullable")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTable.table.columns.map((column) => (
                            <tr key={`${selectedTable.schema}.${selectedTable.table.name}.${column.name}`}>
                              <td>{column.name}</td>
                              <td>{column.dataType}</td>
                              <td>{column.notNull ? t("schema.columnNotNull") : t("schema.columnNullableYes")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="fg-schema-ddl">
                    <h4>{t("schema.detailDDL")}</h4>
                    {ddlLoading ? (
                      <div className="fg-schema-ddl-loading">
                        <VSCodeProgressRing />
                        <span>{t("schema.ddlLoading")}</span>
                      </div>
                    ) : ddlError ? (
                      <div className="fg-schema-ddl-error">{ddlError}</div>
                    ) : ddl ? (
                      <pre>{ddl}</pre>
                    ) : (
                      <span>{t("schema.ddlLoading")}</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="fg-schema-detail-placeholder">{t("schema.detailNone")}</p>
              )}
            </div>
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
                  className="fg-results__grid-editor"
                  getCellContent={getCellContent}
                  columns={columns}
                  rows={rowCount}
                  rowHeight={32}
                  smoothScrollX
                  smoothScrollY
                  freezeColumns={1}
                  rowMarkers="both"
                  rowMarkerStartIndex={1}
                  rangeSelect="multi-rect"
                  columnSelect="multi"
                  rowSelect="multi"
                  onGridSelectionChange={setGridSelection}
                  onCanvasFocused={() => setIsGridFocused(true)}
                  onCanvasBlur={() => setIsGridFocused(false)}
                  onColumnResize={handleColumnResize}
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
          <div className="fg-log-toolbar">
            <VSCodeTextField
              placeholder={t("logs.filterPlaceholder")}
              value={logFilter}
              onInput={(event: React.ChangeEvent<HTMLInputElement>) =>
                setLogFilter(event.target.value)
              }
              aria-label={t("logs.filterPlaceholder")}
            />
            <VSCodeDropdown value={logLevelFilter} onChange={handleLogLevelChange}>
              <VSCodeOption value="all">{t("logging.level.all")}</VSCodeOption>
              <VSCodeOption value="error">{t("logging.level.error")}</VSCodeOption>
              <VSCodeOption value="warn">{t("logging.level.warn")}</VSCodeOption>
              <VSCodeOption value="info">{t("logging.level.info")}</VSCodeOption>
            </VSCodeDropdown>
            <VSCodeDropdown value={logSourceFilter} onChange={handleLogSourceChange}>
              <VSCodeOption value="all">{t("logging.source.all")}</VSCodeOption>
              <VSCodeOption value="core">{t("logging.source.core")}</VSCodeOption>
              <VSCodeOption value="extension">{t("logging.source.extension")}</VSCodeOption>
            </VSCodeDropdown>
            <VSCodeButton appearance="secondary" onClick={handleClearLogs}>
              {t("logging.clear")}
            </VSCodeButton>
          </div>
          <div className="fg-log-list">
            {filteredLogs.length === 0 && <span>{t("logging.empty")}</span>}
            {filteredLogs.map((entry) => (
              <article key={entry.id} className="fg-log-entry" data-level={entry.level}>
                <div className="fg-log-entry__meta">
                  <span className="fg-log-entry__timestamp">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="fg-log-entry__level">
                    {t(`logging.level.${entry.level}`)}
                  </span>
                  <span className="fg-log-entry__source">
                    {t(`logging.source.${entry.source}`)}
                  </span>
                </div>
                <span className="fg-log-entry__message">{entry.message}</span>
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

interface SchemaTreeProps {
  schemas: SchemaEntry[];
  expandedSchemas: Set<string>;
  expandedTables: Set<string>;
  selectedTableId: string | null;
  onToggleSchema: (schema: string) => void;
  onToggleTable: (schema: string, table: string) => void;
  onSelectTable: (schema: string, table: SchemaTable) => void;
  onInsertQuery: (schema: string, table: SchemaTable) => void;
  emptyMessage: string;
}

const SchemaTree: React.FC<SchemaTreeProps> = ({
  schemas,
  expandedSchemas,
  expandedTables,
  selectedTableId,
  onToggleSchema,
  onToggleTable,
  onSelectTable,
  onInsertQuery,
  emptyMessage
}) => {
  if (!schemas.length) {
    return (
      <VSCodeTree>
        <span>{emptyMessage}</span>
      </VSCodeTree>
    );
  }

  return (
    <VSCodeTree>
      {schemas.map((schema) => {
        const schemaId = `schema:${schema.name}`;
        const schemaExpanded = expandedSchemas.has(schema.name);
        return (
          <VSCodeTreeItem
            key={schemaId}
            id={schemaId}
            expanded={schemaExpanded}
            onClick={() => onToggleSchema(schema.name)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleSchema(schema.name);
              }
            }}
            aria-label={schema.name}
            tabIndex={0}
          >
            {schema.name}
            {schema.tables.map((table) => {
              const tableId = makeTableId(schema.name, table.name);
              const tableExpanded = expandedTables.has(tableId);
              const selected = selectedTableId === tableId;
              return (
                <VSCodeTreeItem
                  key={tableId}
                  id={`table:${tableId}`}
                  expanded={tableExpanded}
                  selected={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!tableExpanded) {
                      onToggleTable(schema.name, table.name);
                    }
                    onSelectTable(schema.name, table);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSelectTable(schema.name, table);
                    } else if (event.key === " ") {
                      event.preventDefault();
                      onToggleTable(schema.name, table.name);
                    }
                  }}
                  aria-label={`${table.name} (${table.type})`}
                  tabIndex={0}
                >
                  {table.name}
                  {table.columns.map((column) => (
                    <VSCodeTreeItem
                      key={`${tableId}.${column.name}`}
                      id={`column:${tableId}.${column.name}`}
                      aria-label={`${column.name} ${column.dataType}`}
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onInsertQuery(schema.name, table);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onInsertQuery(schema.name, table);
                        }
                      }}
                    >
                      {column.name}
                      <span className="fg-column-type">{column.dataType}</span>
                    </VSCodeTreeItem>
                  ))}
                </VSCodeTreeItem>
              );
            })}
          </VSCodeTreeItem>
        );
      })}
    </VSCodeTree>
  );
};
