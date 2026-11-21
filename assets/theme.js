/* Colour theme: prefers-color-scheme, with an explicit data-theme that wins. */
(function () {
  var KEY = "ph-theme";
  var root = document.documentElement;

  function current() {
    var attr = root.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply(theme, persist) {
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
      if (persist) {
        try { localStorage.setItem(KEY, theme); } catch (e) {}
      }
    }
    sync();
  }

  function sync() {
    var theme = current();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var styles = getComputedStyle(root);
      meta.setAttribute("content", styles.getPropertyValue("--theme-color").trim() || (theme === "dark" ? "#0B1018" : "#FFFFFF"));
    }
    document.querySelectorAll("[data-set-theme]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-set-theme") === theme ? "true" : "false");
    });
  }

  try {
    var stored = localStorage.getItem(KEY);
    if ((stored === "light" || stored === "dark") && root.getAttribute("data-theme") !== stored) {
      root.setAttribute("data-theme", stored);
    }
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-set-theme]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-set-theme"), true);
      });
    });
    sync();
  });

  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  var onScheme = function () { if (!root.hasAttribute("data-theme")) sync(); };
  if (mq.addEventListener) mq.addEventListener("change", onScheme);
  else if (mq.addListener) mq.addListener(onScheme);
})();
