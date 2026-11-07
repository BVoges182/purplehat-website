export const PRICE_PANE_HEIGHT = 560;
export const RSI_PANE_HEIGHT = 220;
export const CHART_STACK_BREAKPOINT = 1100;

// Below the breakpoint the two charts stack. Each RSI pane stays in the same
// column as its price pane, directly underneath it, at a fixed height.
export function chartBoardLayout(viewportWidth) {
  const width = Number(viewportWidth);
  const stacked = !Number.isFinite(width) || width <= CHART_STACK_BREAKPOINT;
  const columns = stacked ? 1 : 2;
  return {
    columns,
    stacked,
    signals: "below",
    charts: [
      { interval: "4h", title: "4H", column: 1, priceHeight: PRICE_PANE_HEIGHT, rsiHeight: RSI_PANE_HEIGHT, rsiUnderPrice: true },
      { interval: "1d", title: "Daily", column: stacked ? 1 : 2, priceHeight: PRICE_PANE_HEIGHT, rsiHeight: RSI_PANE_HEIGHT, rsiUnderPrice: true },
    ],
  };
}
