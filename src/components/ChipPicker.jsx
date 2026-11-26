import { useState } from "react";
import { splitTags, joinTags } from "../lib/tags";

const same = (a, b) =>
  String(a || "")
    .trim()
    .toLowerCase() ===
  String(b || "")
    .trim()
    .toLowerCase();

const unique = (list) => {
  const out = [];
  for (const label of list || []) {
    const clean = String(label || "").trim();
    if (clean && !out.some((x) => same(x, clean))) out.push(clean);
  }
  return out;
};

export default function ChipPicker({
  title,
  presets = [],
  customPresets = [],
  value = "",
  onChange,
  onAddCustom,
  onRemoveCustom,
  readOnly = false,
  allowAdd = true,
  placeholder = "Add a custom tag",
  addLabel = "+ Add",
  hint = "",
  note = ""
}) {
  const [draft, setDraft] = useState("");
  const values = splitTags(value);
  const builtins = unique(presets);
  const savedCustom = unique(customPresets).filter(
    (label) => !builtins.some((preset) => same(preset, label))
  );
  const currentCustom = values.filter(
    (label) =>
      !builtins.some((preset) => same(preset, label)) &&
      !savedCustom.some((preset) => same(preset, label))
  );
  const all = [...builtins, ...savedCustom, ...currentCustom];
  const deletable = [...savedCustom, ...currentCustom];
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
    onAddCustom?.(label);
    if (!selected(label)) onChange(joinTags([...values, label]));
    setDraft("");
  };
  const removeCustom = (label) => {
    onRemoveCustom?.(label);
    if (selected(label)) {
      onChange(joinTags(values.filter((item) => !same(item, label))));
    }
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
          const canDelete = !readOnly && !!onRemoveCustom && deletable.some((x) => same(x, label));
          return (
            <div
              key={label}
              className={
                "flex items-center rounded-xl border transition " +
                (on
                  ? "border-plum bg-plum text-white shadow-sm "
                  : "border-plum/20 bg-plum/10 ") +
                (readOnly ? "cursor-default" : "")
              }
            >
              <button
                type="button"
                aria-pressed={on}
                disabled={readOnly}
                onClick={() => toggle(label)}
                className="min-w-0 flex-1 px-3 py-2 text-left text-sm font-semibold disabled:cursor-default"
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 break-words">{label}</span>
                  {on && <span aria-hidden>✓</span>}
                </span>
              </button>
              {canDelete && (
                <button
                  type="button"
                  aria-label={"Remove custom " + label}
                  title="Remove custom option"
                  onClick={() => removeCustom(label)}
                  className="mr-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold opacity-60 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {hint && values.length === 0 && (
        <p className="text-xs opacity-60">{hint}</p>
      )}
      {allowAdd && !readOnly && onAddCustom && (
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
