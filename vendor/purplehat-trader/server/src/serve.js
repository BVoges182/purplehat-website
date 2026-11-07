import { boot } from "./index.js";

// Production entry. Local development stays on `npm run dev`, which runs index.js and Vite.
// TRADER_WARMUP=0 skips the startup candle catch-up. Leave it unset on a host.
boot({
  basePath: "/trader",
  redirectRoot: true,
  warmup: process.env.TRADER_WARMUP !== "0",
});
