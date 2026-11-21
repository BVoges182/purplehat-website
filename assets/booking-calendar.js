export function dayState({ iso, todayKey, openDays, selectedDate }) {
  const open = openDays instanceof Set
    ? openDays.has(iso)
    : Array.isArray(openDays)
      ? openDays.includes(iso)
      : Boolean(openDays && openDays[iso]);
  const selected = Boolean(selectedDate) && iso === selectedDate;
  const today = iso === todayKey;
  const classes = ["cal-day", open ? "is-available" : "is-unavailable"];
  if (today) classes.push("is-today");
  if (selected) classes.push("is-selected");
  return {
    available: open,
    unavailable: !open,
    selected,
    today,
    disabled: !open,
    ariaDisabled: open ? "false" : "true",
    className: classes.join(" "),
  };
}
