import { createRoot } from "react-dom/client";
import css from "./index.css?inline";
import HomepageStatements from "./components/HomepageStatements";

function mountHost(host) {
  if (!host || host.dataset.mounted === "1") return;
  host.dataset.mounted = "1";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const app = document.createElement("div");
  shadow.append(style, app);
  createRoot(app).render(<HomepageStatements />);
}

export function mountHomepageStatements() {
  document.querySelectorAll("[data-statements]").forEach(mountHost);
}

mountHomepageStatements();
window.mountHomepageStatements = mountHomepageStatements;
