import { useState } from "react";
import { splitTags, joinTags } from "../lib/tags";

const same = (a, b) =>
  String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export default function ChipPicker({
  title,
  presets = [],
  value = "",
  onChange,
  readOnly = false,
  allowAdd = true,
  placeholder = "Add a custom tag",
  addLabel = "+ Add",
  hint = "",
  note = ""
}) {
  const [draft, setDraft] = useState("");
  const values = splitTags(value);
  const custom = values.filter(
    (item) => !presets.some((preset) => same(preset, item))
  );
  const all = [...presets, ...custom];
  const selected = (label) => values.some((item) => same(item, label));
  const toggle = (label) => {
    if (readOnly) return;
    const next = selected(label)
      ? values.filter((item) => !same(item, label))
      : [...values, label];
    onChange(joinTags(next));
  };
  const add = (event) => {
    event.preventDefault();
    const label = draft.trim();
    if (!label) return;
    if (!selected(label)) onChange(joinTags([...values, label]));
    setDraft("");
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-bold">{title}</p>
        {note && (
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
            {note}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {all.map((label) => {
          const on = selected(label);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => toggle(label)}
              className={
                "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition " +
                (on
                  ? "border-plum bg-plum text-white shadow-sm "
                  : "border-plum/20 bg-plum/10 hover:bg-plum/15 ") +
                (readOnly ? "cursor-default" : "")
              }
            >
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 break-words">{label}</span>
                {on && <span aria-hidden>✓</span>}
              </span>
            </button>
          );
        })}
      </div>
      {hint && values.length === 0 && (
        <p className="text-xs opacity-60">{hint}</p>
      )}
      {allowAdd && !readOnly && (
        <form onSubmit={add} className="flex gap-2">
          <input
            className="inp"
            value={draft}
            maxLength={60}
            aria-label={placeholder}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-xl bg-plum/15 px-3 py-1.5 text-sm font-bold whitespace-nowrap disabled:opacity-40"
          >
            {addLabel}
          </button>
        </form>
      )}
    </section>
  );
}
