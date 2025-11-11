import { describe, expect, it } from "vitest";
import {
  formatCellValue,
  buildClipboardText,
  estimateColumnWidth,
  type GridSelectionRange
} from "../src/webview/utils/resultGrid";

const columns = [
  { name: "id", dataType: "int4" },
  { name: "name", dataType: "text" },
  { name: "created_at", dataType: "timestamptz" }
];

const rows: unknown[][] = [
  [1, "Alice", new Date("2024-05-01T12:34:56.000Z")],
  [2, null, { enabled: true }],
  [3, "Charlie", undefined]
];

describe("resultGrid utils", () => {
  it("formats diverse cell values for display", () => {
    expect(formatCellValue(null)).toBe("NULL");
    expect(formatCellValue(undefined)).toBe("NULL");
    expect(formatCellValue(42)).toBe("42");
    expect(formatCellValue(3.14159)).toBe("3.14159");
    expect(formatCellValue(true)).toBe("true");
    expect(formatCellValue("hello")).toBe("hello");
    expect(formatCellValue(new Date("2023-01-02T00:00:00Z"))).toBe("2023-01-02T00:00:00.000Z");
    expect(formatCellValue({ foo: "bar" })).toBe('{"foo":"bar"}');
    expect(formatCellValue([1, 2, 3])).toBe('[1,2,3]');
  });

  it("builds clipboard text with headers", () => {
    const selection: GridSelectionRange = { x: 0, y: 0, width: 2, height: 2 };
    const text = buildClipboardText({
      columns,
      rows,
      selections: [selection],
      includeHeaders: true
    });

    expect(text).toBe("id\tname\n1\tAlice\n2\tNULL");
  });

  it("trims selections outside available bounds", () => {
    const selection: GridSelectionRange = { x: 1, y: 1, width: 5, height: 5 };
    const text = buildClipboardText({
      columns,
      rows,
      selections: [selection],
      includeHeaders: false
    });

    expect(text).toBe('NULL\t{"enabled":true}\nCharlie\tNULL');
  });

  it("estimates column widths using samples", () => {
    const idWidth = estimateColumnWidth({
      column: columns[0],
      rows,
      columnIndex: 0
    });
    const nameWidth = estimateColumnWidth({
      column: columns[1],
      rows,
      columnIndex: 1
    });

    expect(idWidth).toBeGreaterThan(60);
    expect(nameWidth).toBeGreaterThanOrEqual(idWidth);
  });
});
