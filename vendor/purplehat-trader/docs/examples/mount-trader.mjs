// EXAMPLE ONLY. This file is not the live purplehat.fun server and it is not imported by Trader.
// The accounting site source is not in this repository. Do not point Hostinger at purplehat-trading.
//
// Required Trader entry when it runs by itself: server/src/serve.js (`npm start`).
// Required mount function when a Node server can call it: mountTrader() from server/src/app.js.
//
// This example is a plain Node HTTP server. It does not assume the existing website uses Express.
// Requests under /trader go to Trader. Every other path, including / and /api/invoices, stays with the parent.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../../server/src/app.js";
import { openDatabase } from "../../server/src/db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = openDatabase(path.join(root, process.env.DATABASE_URL || "server/data/trading.sqlite"));
const trader = createApp(db, {
  basePath: "/trader",
  staticDir: path.join(root, "dist"),
});

const port = Number(process.env.PORT ?? 8792);
const host = process.env.HOST || "0.0.0.0";

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  const pathOnly = url.split("?")[0];
  if (pathOnly === "/trader" || pathOnly.startsWith("/trader/")) {
    trader(req, res);
    return;
  }
  if (pathOnly === "/" || pathOnly === "") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Existing site</h1>");
    return;
  }
  if (pathOnly === "/api/invoices") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ site: "accounting" }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, host);
