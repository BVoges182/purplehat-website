import { useEffect, useState } from "react";
import { api } from "./api";

export function useFinances() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    async function load(silent) {
      try {
        const next = await api.finances();
        if (stop) return;
        setData(next);
        setError("");
      } catch (err) {
        if (stop) return;
        if (!silent) setError(err.message);
      }
    }
    load(false);
    const poll = setInterval(() => load(true), 8000);
    return () => {
      stop = true;
      clearInterval(poll);
    };
  }, []);

  return { data, error };
}

export function resultOf(revenue, expenses) {
  return (Number(revenue) || 0) - (Number(expenses) || 0);
}

export function monthHeading(ym) {
  const [y, m] = String(ym).split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-ZA", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
