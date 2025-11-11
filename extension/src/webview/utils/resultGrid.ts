export interface GridSelectionRange {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResultGridColumn {
  name: string;
  dataType: string;
}

export interface BuildClipboardTextParams {
  columns: ResultGridColumn[];
  rows: unknown[][];
  selections: GridSelectionRange[];
  includeHeaders?: boolean;
}

interface EstimateColumnWidthParams {
  column: ResultGridColumn;
  rows: unknown[][];
  columnIndex: number;
  minimumWidth?: number;
  maximumWidth?: number;
}

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }

  return String(value);
}

export function estimateColumnWidth({
  column,
  rows,
  columnIndex,
  minimumWidth = 96,
  maximumWidth = 420
}: EstimateColumnWidthParams): number {
  const AVG_CHAR_WIDTH = 8;
  const PADDING = 24;
  const headerLength = column.name.length;

  let maxContentLength = headerLength;
  const sampleLimit = Math.min(rows.length, 50);

  for (let rowIndex = 0; rowIndex < sampleLimit; rowIndex += 1) {
    const value = rows[rowIndex]?.[columnIndex];
    const formatted = formatCellValue(value);
    if (formatted.length > maxContentLength) {
      maxContentLength = formatted.length;
    }
  }

  const calculated = maxContentLength * AVG_CHAR_WIDTH + PADDING;
  if (calculated < minimumWidth) {
    return minimumWidth;
  }
  if (calculated > maximumWidth) {
    return maximumWidth;
  }
  return Math.round(calculated);
}

export function buildClipboardText({
  columns,
  rows,
  selections,
  includeHeaders = false
}: BuildClipboardTextParams): string {
  if (!selections.length || !columns.length || !rows.length) {
    return "";
  }

  const lines: string[] = [];

  selections.forEach((selection, index) => {
    const startX = Math.max(0, selection.x);
    const startY = Math.max(0, selection.y);
    const endX = Math.min(columns.length, startX + Math.max(0, selection.width));
    const endY = Math.min(rows.length, startY + Math.max(0, selection.height));

    if (startX >= endX || startY >= endY) {
      return;
    }

    if (includeHeaders && index === 0) {
      const header = columns.slice(startX, endX).map((column) => column.name);
      lines.push(header.join("\t"));
    }

    for (let rowIndex = startY; rowIndex < endY; rowIndex += 1) {
      const row = rows[rowIndex];
      const values: string[] = [];
      for (let columnIndex = startX; columnIndex < endX; columnIndex += 1) {
        const rawValue = row?.[columnIndex];
        values.push(formatCellValue(rawValue));
      }
      lines.push(values.join("\t"));
    }
  });

  return lines.join("\n");
}
