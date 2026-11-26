import { alignedStudyPoints, chartTime } from "../indicators.js";

export function priceTimes(rows) {
  return (rows || []).map((row) => row.time ?? chartTime(row.openTime));
}

export function rsiPanePoints(rows) {
  const source = rows || [];
  const price = priceTimes(source);
  const rsi = alignedStudyPoints(source, (row) => row.rsi);
  const rsiMa = alignedStudyPoints(source, (row) => row.rsiMa);
  return { price, rsi, rsiMa };
}

export function paneEdges(points) {
  const times = (points || []).map((point) => point.time).filter((time) => time != null);
  return { first: times[0] ?? null, last: times.at(-1) ?? null, count: times.length };
}
