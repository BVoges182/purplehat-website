import { PUBLICATION_DELAY_MS, nextCloseTime } from "../../shared/candleSchedule.js";

// The next scan follows the sooner exchange close, not the moment the process started.
export function nextScanAt(now = Date.now(), delay = PUBLICATION_DELAY_MS) {
  return Math.min(nextCloseTime("4h", now), nextCloseTime("1d", now)) + delay;
}

export function armCloseScan(run, { now = () => Date.now(), schedule = setTimeout, clear = clearTimeout, delay = PUBLICATION_DELAY_MS } = {}) {
  let timer = null;
  let stopped = false;
  function arm() {
    if (stopped) return;
    const wait = Math.max(1000, nextScanAt(now(), delay) - now());
    timer = schedule(() => {
      Promise.resolve()
        .then(() => run())
        .finally(arm);
    }, wait);
  }
  arm();
  return () => {
    stopped = true;
    if (timer != null) clear(timer);
  };
}
