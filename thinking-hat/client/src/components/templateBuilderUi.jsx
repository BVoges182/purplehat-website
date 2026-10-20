export function FrameworkBadge({ label }) {
  if (!label) return null;
  const tone = label === "US GAAP"
    ? "bg-[#2a1548] text-white"
    : label.startsWith("UK")
      ? "bg-[#f5f0ff] text-plum"
      : "border border-[rgba(109,40,217,0.18)] bg-white text-[#4c1d95]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>
  );
}

export function ReviewFlag({ reason }) {
  return (
    <span
      title={reason || "Review this template before using it."}
      className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800"
    >
      Needs review
    </span>
  );
}

export function SectionChips({ chips }) {
  if (!chips?.length) return <span className="text-sm text-mute">No sections yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span key={chip} className="inline-flex rounded-full bg-[#f5f0ff] px-2 py-0.5 text-xs font-semibold text-[#4c1d95]">
          {chip}
        </span>
      ))}
    </div>
  );
}
