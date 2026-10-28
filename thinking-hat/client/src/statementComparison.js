function monthIndexes(columns) {
  return (columns || [])
    .map((column, index) => ({ column, index }))
    .filter((item) => !/year to date/i.test(String(item.column || "")))
    .slice(0, 3)
    .map((item) => item.index);
}

export function threeMonthComparison(section, title) {
  const columns = Array.isArray(section?.columns) ? section.columns : [];
  const indexes = monthIndexes(columns);
  const picked = indexes.map((index) => columns[index]);
  const units = indexes.map((index) => section?.units?.[index] || "");
  const rows = (Array.isArray(section?.rows) ? section.rows : []).map((row) => {
    const values = indexes.map((index) => row.values?.[index] ?? null);
    const formats = indexes.map((index) => row.formats?.[index] || "money");
    const latest = values[0];
    const previous = values[1];
    const change = typeof latest === "number" && typeof previous === "number"
      ? Math.round((latest - previous) * 100) / 100
      : null;
    return {
      kind: row.kind,
      label: row.label,
      ...(row.indent ? { indent: row.indent } : {}),
      values: [...values, change],
      formats: [...formats, formats[0] || "money"],
    };
  });
  return {
    title,
    columns: [...picked, "Change"],
    units: [...units, units[0] || ""],
    labelHeader: section?.labelHeader || "",
    rows,
  };
}
