import { useState } from "react";
import { same, statusLabel } from "../lib/util";

const ADD_STATUSES = [
  ["want", "Want to Read"],
  ["reading", "Reading"],
  ["done", "Completed"],
  ["hiatus", "Hiatus"],
  ["dropped", "Dropped"]
];

export default function AddFromFriend({
  source,
  mine = [],
  friendName = "a friend",
  onAdd,
  onOpen,
  onClose
}) {
  const existing = (mine || []).find((row) => same(row, source));
  const [status, setStatus] = useState("want");
  const [chapter, setChapter] = useState("");
  const [busy, setBusy] = useState(false);

  if (!source) return null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const value = chapter === "" ? null : Math.max(0, Number(chapter));
      await onAdd?.({ status, chapter: Number.isFinite(value) ? value : null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="pop w-full max-w-md rounded-3xl bg-paper p-6 space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-wide opacity-60">
            Add from {friendName}
          </p>
          <h3 className="text-xl font-extrabold">{source.title}</h3>
        </div>

        {existing ? (
          <>
            <p className="rounded-xl bg-plum/10 p-3">
              On your list as <b>{statusLabel(existing.status)}</b>.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpen?.(existing)}
                className="flex-1 rounded-xl bg-plum text-white font-bold py-2.5"
              >
                Open it
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-plum/15 font-bold px-4"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-semibold opacity-70">Start as</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ADD_STATUSES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={status === key}
                    onClick={() => setStatus(key)}
                    className={
                      "rounded-full px-3 py-1.5 text-sm font-bold " +
                      (status === key
                        ? "bg-ink text-white dark:bg-white dark:text-ink"
                        : "bg-plum/10")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-sm font-semibold opacity-70">
                Starting chapter (optional)
              </span>
              <input
                className="inp"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="e.g. 1"
                value={chapter}
                onChange={(event) => setChapter(event.target.value)}
              />
            </label>
            <p className="text-xs opacity-60">
              Cover, genres, tags, warnings, synopsis, read link, AniList id and
              characters are copied. Their rating, review, footnote and hidden
              flag are never copied.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="flex-1 rounded-xl bg-plum text-white font-bold py-2.5 disabled:opacity-60"
              >
                {busy ? "Adding…" : "Add to my list"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-plum/15 font-bold px-4"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
