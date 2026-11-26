import { useEffect, useState } from "react";
import { anilistAllChars } from "../lib/anilist";
import { norm } from "../lib/util";
import SpoilerText from "./SpoilerText";

export default function CharSection({
  chars,
  setChars,
  readOnly,
  thoughts,
  anilistId
}) {
  const [adding, setAdding] = useState(false);
  const [nm, setNm] = useState("");
  const [im, setIm] = useState("");
  const [pool, setPool] = useState(null);
  const [look, setLook] = useState(false);
  useEffect(() => {
    if (!adding || pool) return;
    setLook(true);
    (async () => {
      if (!anilistId) {
        // MangaUpdates/Kitsu/manual comics have no AniList character pool.
        console.warn("Skipping AniList characters: no anilist_id on this series.");
        setPool([]);
        setLook(false);
        return;
      }
      try {
        setPool(await anilistAllChars(anilistId));
      } catch (e) {
        setPool([]);
      }
      setLook(false);
    })();
  }, [adding]);
  const q = norm(nm);
  const taken = (n) => chars.some((c) => norm(c.name) === norm(n));
  const matches =
    q.length < 2 || !pool
      ? []
      : pool
          .filter(
            (c) =>
              !taken(c.name) &&
              [c.name, ...c.alt].some((n) => norm(n).includes(q))
          )
          .slice(0, 5);
  const upd = (i, v) =>
    setChars((c) => c.map((x, j) => (j === i ? { ...x, comment: v } : x)));
  const push = (c) => {
    setChars((cs) => [
      ...cs,
      { name: c.name, image_url: c.image_url || "", comment: "" }
    ]);
    setNm("");
    setIm("");
    setAdding(false);
  };
  const add = () => {
    if (matches.length && !im.trim()) return push(matches[0]);
    if (nm.trim()) push({ name: nm.trim(), image_url: im.trim() });
  };
  if (readOnly && !chars.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-bold">🎭 Main characters</p>
        {!readOnly && (
          <button
            onClick={() => setAdding(!adding)}
            className="h-8 w-8 rounded-full bg-plum text-white font-bold text-lg leading-none"
            aria-label="Add a character"
          >
            +
          </button>
        )}
      </div>
      {adding && (
        <div className="rounded-xl bg-plum/10 p-3 space-y-2">
          <input
            className="inp"
            placeholder="Type a name, we will look it up in this series"
            value={nm}
            onChange={(e) => setNm(e.target.value)}
          />
          {look && (
            <p className="text-xs opacity-60">
              Looking up this series’ characters…
            </p>
          )}
          {matches.map((m) => (
            <button
              key={m.name}
              onClick={() => push(m)}
              className="flex items-center gap-2 w-full text-left rounded-lg p-1.5 hover:bg-plum/15"
            >
              {m.image_url ? (
                <img
                  src={m.image_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <span className="h-9 w-9 rounded-full bg-plum text-white font-bold grid place-items-center">
                  {m.name[0]}
                </span>
              )}
              <span className="text-sm font-semibold">{m.name}</span>
            </button>
          ))}
          {nm.trim().length > 1 && !look && pool && matches.length === 0 && (
            <p className="text-xs opacity-60">
              No characters found — you can still add one by hand.
            </p>
          )}
          <input
            className="inp"
            placeholder="Picture link (optional, only if not found)"
            value={im}
            onChange={(e) => setIm(e.target.value)}
          />
          <button
            onClick={add}
            className="rounded-full bg-plum text-white font-bold px-4 py-1.5 text-sm"
          >
            {matches.length && !im.trim() ? "Add best match" : "Add character"}
          </button>
        </div>
      )}
      {chars.length === 0 && !adding && (
        <p className="text-sm opacity-60">No characters yet. Tap + to add one.</p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {chars.map((c, i) => (
          <div key={i} className="w-36 shrink-0 space-y-1 text-center">
            <div className="relative mx-auto h-20 w-20">
              {c.image_url ? (
                <img
                  src={c.image_url}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-plum/40"
                />
              ) : (
                <span className="h-20 w-20 rounded-full bg-plum text-white text-2xl font-bold grid place-items-center">
                  {c.name[0]}
                </span>
              )}
              {!readOnly && (
                <button
                  onClick={() =>
                    setChars((cs) => cs.filter((_, j) => j !== i))
                  }
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-black/60 text-white text-xs"
                  aria-label="Remove character"
                >
                  ×
                </button>
              )}
            </div>
            <p className="text-xs font-bold truncate">{c.name}</p>
            {readOnly ? (
              c.comment && (
                <p className="text-xs opacity-80 whitespace-pre-line text-left">
                  <SpoilerText text={c.comment} />
                </p>
              )
            ) : (
              <textarea
                className="inp !text-xs"
                rows={2}
                placeholder="Your thoughts…"
                value={c.comment || ""}
                onChange={(e) => upd(i, e.target.value)}
              />
            )}
            {(thoughts ? thoughts(c) : []).map((t, k) => (
              <p
                key={k}
                className="text-xs text-left rounded-lg bg-plum/10 p-1.5 whitespace-pre-line"
              >
                <b className="text-plum">{t.name}:</b>{" "}
                <SpoilerText text={t.comment} />
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
