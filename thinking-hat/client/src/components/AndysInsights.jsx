import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Card } from "./ui";

const PREVIEW_COUNT = 4;

function publicCopy(value) {
  return String(value || "")
    .replaceAll("John McEnroe's insights", "Purple Hat insights")
    .replaceAll("John McEnroe", "Purple Hat");
}

function formatUpdated(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function Finding({ finding, open }) {
  return (
    <li className="border-t border-[rgba(109,40,217,0.08)] pt-3">
      {finding.title ? <p className="text-sm font-semibold text-ink">{publicCopy(finding.title)}</p> : null}
      {finding.detail ? (
        <p className={`mt-1 text-sm leading-5 text-mute ${open ? "" : "line-clamp-2"}`}>{publicCopy(finding.detail)}</p>
      ) : null}
      {finding.sourceUrl ? (
        <a className="mt-1 inline-block text-xs font-semibold text-plum" href={finding.sourceUrl} target="_blank" rel="noreferrer">
          Source
        </a>
      ) : null}
    </li>
  );
}

function ClippedBody({ open, children }) {
  const ref = useRef(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => setOverflows(!open && node.scrollHeight > node.clientHeight + 1);
    measure();
    if (open || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, children]);

  return (
    <div
      ref={ref}
      className={open ? "" : "max-h-72 overflow-hidden"}
      style={overflows ? {
        maskImage: "linear-gradient(to bottom, #000 calc(100% - 2.75rem), transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 2.75rem), transparent)",
      } : undefined}
    >
      {children}
    </div>
  );
}

function Brief({ insights, title, open, onToggle }) {
  const findings = insights.findings || [];
  const visible = open ? findings : findings.slice(0, PREVIEW_COUNT);
  const updated = formatUpdated(insights.updated);
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{title}</p>
        {updated ? <p className="shrink-0 text-xs text-mute">{updated}</p> : null}
      </div>
      <h3 className="mt-2 font-display text-lg font-normal leading-snug text-ink">{publicCopy(insights.headline)}</h3>
      <ClippedBody open={open}>
        {visible.length ? (
          <ol className="mt-4 space-y-3">
            {visible.map((finding, index) => <Finding key={`${finding.title}-${index}`} finding={finding} open={open} />)}
          </ol>
        ) : null}
        {insights.actions?.length ? (
          <div className="mt-4 rounded-2xl bg-[#f6f3ff] px-3 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">Actions</p>
            <ul className="mt-2 space-y-1.5">
              {insights.actions.map((action) => (
                <li key={action} className="text-sm leading-5 text-ink">{publicCopy(action)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </ClippedBody>
      {findings.length ? (
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-plum"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? "Hide full brief" : "View full brief"}
        </button>
      ) : null}
    </div>
  );
}

function EmptyBrief({ configured, title }) {
  return (
    <div>
      {title ? <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{title}</p> : null}
      <h3 className={`font-display text-lg font-extrabold text-ink ${title ? "mt-2" : ""}`}>This week's brief is not here yet.</h3>
      <p className="mt-2 text-sm leading-5 text-mute">
        {configured
          ? "The insights file is saved for this client, but it could not be read."
          : "A weekly note will show up here once a Grok bot is assigned to this client."}
      </p>
    </div>
  );
}

export function useClientBrief({ missingOnError = false } = {}) {
  const [state, setState] = useState({ status: "loading", configured: false, botName: "", insights: null, currency: "" });

  useEffect(() => {
    let stop = false;
    api.insights()
      .then((data) => {
        if (stop) return;
        setState({
          status: "ready",
          configured: Boolean(data.configured),
          botName: data.botName || "",
          insights: data.insights || null,
          currency: data.currency || "",
        });
      })
      .catch(() => {
        if (!stop) {
          setState({ status: "ready", configured: !missingOnError, botName: "", insights: null, currency: "" });
        }
      });
    return () => { stop = true; };
  }, [missingOnError]);

  return state;
}

function InsightsView({ always = false, fallback = null, state }) {
  const [open, setOpen] = useState(false);
  if (state.status === "ready" && !always && !state.configured) return fallback;
  const showBrief = state.status === "ready" && state.insights;
  const showEmpty = state.status === "ready" && !state.insights;
  const title = "Purple Hat insights";

  return (
    <Card className="flex h-full flex-col">
      {state.status === "loading" ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-plum">{title}</p>
          <p className="mt-2 text-sm text-mute">Loading the brief…</p>
        </div>
      ) : null}
      {showBrief ? <Brief insights={state.insights} title={title} open={open} onToggle={() => setOpen((value) => !value)} /> : null}
      {showEmpty ? <EmptyBrief configured={state.configured} title={title} /> : null}
      {showBrief && state.insights.joke ? (
        <p className="mt-auto pt-5 text-xs italic leading-5 text-mute">{publicCopy(state.insights.joke)}</p>
      ) : null}
    </Card>
  );
}

function OwnInsights(props) {
  const state = useClientBrief({ missingOnError: true });
  return <InsightsView {...props} state={state} />;
}

export default function AndysInsights({ brief = null, ...props }) {
  if (brief) return <InsightsView {...props} state={brief} />;
  return <OwnInsights {...props} />;
}
