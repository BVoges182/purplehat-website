import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(appRoot, "client");
process.chdir(clientRoot);

await build({
  root: clientRoot,
  configFile: path.join(clientRoot, "vite.config.js"),
});

const react = (await import("@vitejs/plugin-react")).default;
await build({
  root: clientRoot,
  configFile: false,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: path.join(clientRoot, "dist"),
    emptyOutDir: false,
    lib: {
      entry: path.join(clientRoot, "src", "statements-mount.jsx"),
      formats: ["es"],
      fileName: "statements-preview",
    },
    rollupOptions: {
      external: [],
    },
  },
});

await import(pathToFileURL(path.join(appRoot, "scripts", "copy-site.mjs")).href);
