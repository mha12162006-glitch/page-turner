import { useState } from "react";
import { httpUrl } from "../lib/util";
import Avatar from "./Avatar";

const TYPES = ["Official license", "Fan translation"];
const empty = {
  name: "",
  language: "English",
  type: TYPES[0],
  link: "",
  note: ""
};

const keyOf = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

export default function TranslatorRecs({
  rows = [],
  seriesId,
  readOnly = false,
  onSave,
  onDelete,
  notify
}) {
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = !readOnly && !!seriesId && !!onSave;
  const notice = notify || (() => {});

  const startEdit = (row) => {
    setEditing(row.id);
    setDraft({
      name: row.name || "",
      language: row.language || "English",
      type: TYPES.includes(row.type) ? row.type : TYPES[0],
      link: row.link || "",
      note: row.note || ""
    });
    setError("");
  };
  const reset = () => {
    setDraft(empty);
    setEditing(null);
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const name = draft.name.trim();
    const link = httpUrl(draft.link);
    if (!name) {
      const message = "Add a translator or group name.";
      setError(message);
      notice(message);
      return;
    }
    if (!link) {
      const message = "Enter an http:// or https:// link.";
      setError(message);
      notice(message);
      return;
    }
    const duplicate = rows.some(
      (row) => row.id !== editing && keyOf(row.name) === keyOf(name)
    );
    if (duplicate) {
      const message = "A translator with that name is already listed for this series.";
      setError(message);
      notice(message);
      return;
    }
    if (!TYPES.includes(draft.type)) {
      const message = "Choose Official license or Fan translation.";
      setError(message);
      notice(message);
      return;
    }
    setBusy(true);
    try {
      const ok = await onSave({
        id: editing || null,
        seriesId,
        name,
        language: draft.language.trim() || "English",
        type: draft.type,
        link,
        note: draft.note.slice(0, 500)
      });
      if (ok !== false) reset();
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-2xl bg-plum/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl p-4 font-bold">
        <span>Translator recommendations</span>
        <span className="flex items-center gap-2">
          <span
            className="rounded-full bg-plum/20 px-2 py-0.5 text-xs"
            aria-label={rows.length + " translator recommendations"}
          >
            {rows.length}
          </span>
          <span aria-hidden="true" className="text-xs opacity-60">
            ⌄
          </span>
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-xs opacity-70">
          Translators or groups other readers found useful for this series.
          Links are only added when someone enters them.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm opacity-60">No translator recommendations yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-xl bg-white/70 dark:bg-white/5 p-3 flex gap-3"
              >
                <Avatar
                  url={row.ownerAvatar}
                  name={row.ownerName || "A friend"}
                  size={36}
                />
                <div className="min-w-0 flex-1 text-sm space-y-1">
                  <p className="font-bold break-words">{row.name}</p>
                  <p className="text-xs opacity-70">
                    {row.language || "English"} · {row.type}
                  </p>
                  {httpUrl(row.link) && (
                    <a
                      href={httpUrl(row.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={"Open " + row.name + " link"}
                      className="inline-block text-xs font-bold text-plum underline"
                    >
                      Open link ↗
                    </a>
                  )}
                  {row.note && (
                    <p className="break-words whitespace-pre-line">{row.note}</p>
                  )}
                  <p className="text-xs opacity-60">
                    Recommended by {row.ownerName || "A friend"}
                  </p>
                </div>
                {row.mine && !readOnly && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      aria-label={"Edit translator recommendation " + row.name}
                      onClick={() => startEdit(row)}
                      className="rounded-full bg-plum/15 px-2 py-1 text-xs font-bold"
                    >
                      Edit
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        aria-label={"Delete translator recommendation " + row.name}
                        onClick={() => onDelete(row)}
                        className="rounded-full bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-500"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {canAdd ? (
          <form onSubmit={submit} className="space-y-2 border-t border-plum/20 pt-3">
            <input
              className="inp"
              aria-label="Translator or group name"
              placeholder="Translator or group name"
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-sm font-semibold opacity-70">Language</span>
                <input
                  className="inp"
                  aria-label="Translator language"
                  maxLength={60}
                  value={draft.language}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, language: e.target.value }))
                  }
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold opacity-70">Type</span>
                <select
                  className="inp"
                  aria-label="Translator type"
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, type: e.target.value }))
                  }
                >
                  {TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>
            <input
              className="inp"
              aria-label="Translator link"
              placeholder="https://"
              value={draft.link}
              onChange={(e) =>
                setDraft((p) => ({ ...p, link: e.target.value }))
              }
            />
            <label className="block">
              <span className="text-sm font-semibold opacity-70">
                Short note ({draft.note.length}/500)
              </span>
              <textarea
                className="inp"
                aria-label="Translator note"
                rows={3}
                maxLength={500}
                value={draft.note}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, note: e.target.value }))
                }
              />
            </label>
            {error && (
              <p role="alert" className="text-sm font-semibold text-rose-500">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-plum text-white font-bold px-4 py-2 disabled:opacity-50"
              >
                {editing ? "Save changes" : "Add translator recommendation"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-xl bg-plum/15 px-4 py-2 font-bold"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          !readOnly && (
            <p className="text-xs opacity-60">
              Save this series first, then you can add translator recommendations.
            </p>
          )
        )}
      </div>
    </details>
  );
}
