export function formatTable(headers, rows) {
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error("formatTable requires headers");
  }
  const safeRows = rows.map((row) =>
    headers.map((_, index) => String(row[index] ?? "")),
  );
  const widths = headers.map((header, index) =>
    Math.max(
      String(header).length,
      ...safeRows.map((row) => row[index].length),
    ),
  );
  const render = (row) =>
    row
      .map((cell, index) => cell.padEnd(widths[index]))
      .join("  ")
      .trimEnd();
  return [render(headers), ...safeRows.map(render)].join("\n") + "\n";
}
