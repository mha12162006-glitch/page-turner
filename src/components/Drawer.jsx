import { useEffect, useRef, useState } from "react";
import { anilistDetail, searchAniList } from "../lib/anilist";
import {
  arr,
  blank,
  FORMATS,
  isImg,
  norm,
  num,
  PUB,
  STATUS
} from "../lib/util";
import Avatar from "./Avatar";
import CharSection from "./CharSection";
import { FriendLine } from "./Card";
import Stars from "./Stars";

const L = ({ t, children }) => (
  <label className="block">
    <span className="text-sm font-semibold opacity-70">{t}</span>
    {children}
  </label>
);

function Auto({ value, ...p }) {
  const r = useRef();
  useEffect(() => {
    const e = r.current;
    if (e) {
      e.style.height = "auto";
      e.style.height = e.scrollHeight + 2 + "px";
    }
  }, [value]);
  return <textarea ref={r} value={value} {...p} />;
}

export default function Drawer({
  item,
  onClose,
  onSave,
  onDelete,
  onShare,
  onRecommend,
  onAdd,
  readOnly,
  fr,
  chars0,
  thoughts
}) {
  const isNew = !item.id;
  const [f, setF] = useState({
    ...blank,
    ...item,
    genres: (item.genres || []).join(", "),
    tags: (item.tags || []).join(", "),
    media: (item.media || []).join("\n")
  });
  const [chars, setChars] = useState(chars0 || []);
  const [tot, setTot] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    if (!isNew || q.length < 3) return setRes([]);
    setBusy(true);
    const t = setTimeout(
      () =>
        searchAniList(q)
          .then(setRes)
          .catch(() => setRes([]))
          .finally(() => setBusy(false)),
      400
    );
    return () => clearTimeout(t);
  }, [q]);
  const setCh = (k, v) =>
    setF((p) => {
      const n = { ...p, [k]: v === "" ? null : Math.max(0, Number(v)) };
      const c = n.chapter;
      const t = n.total_chapters;
      if (c != null && t && c >= t) n.status = "done";
      else if (c >= 1 && n.status === "want") n.status = "reading";
      return n;
    });
  const setStatus = (k) =>
    setF((p) => ({
      ...p,
      status: k,
      chapter: k === "done" && p.total_chapters ? p.total_chapters : p.chapter
    }));
  const pick = (r) => {
    setF((p) => ({
      ...p,
      ...r,
      genres: r.genres.join(", "),
      tags: (r.tags || []).join(", ")
    }));
    setRes([]);
    setQ("");
    anilistDetail(r.anilist_id)
      .then((d) => {
        setF((p) => ({
          ...p,
          synopsis: p.synopsis || d.synopsis,
          warnings: p.warnings || d.warnings,
          total_chapters: p.total_chapters ?? d.total_chapters,
          read_url: p.read_url || d.read_url
        }));
        setChars((c) => (c.length ? c : d.chars));
      })
      .catch(() => {});
  };
  const fill = async () => {
    setBusy(true);
    try {
      let id = f.anilist_id;
      let base = {};
      if (!id) {
        const r = (await searchAniList(f.title))[0];
        if (!r) return alert("Could not find this title on AniList.");
        id = r.anilist_id;
        base = r;
      }
      const d = await anilistDetail(id);
      setF((p) => ({
        ...p,
        anilist_id: id,
        cover_url: p.cover_url || base.cover_url || "",
        synopsis: p.synopsis || base.synopsis || d.synopsis || "",
        pub_status: p.pub_status || base.pub_status || "",
        genres: p.genres || d.genres.join(", "),
        tags: [...new Set([...arr(p.tags), ...d.tags])].join(", "),
        warnings: p.warnings || d.warnings,
        total_chapters: p.total_chapters ?? d.total_chapters,
        read_url: p.read_url || d.read_url
      }));
      setChars((c) => [
        ...c,
        ...d.chars.filter((x) => !c.some((y) => norm(y.name) === norm(x.name)))
      ]);
    } catch (e) {
      alert("AniList did not respond. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!f.title.trim()) return alert("Add a title first.");
    onSave(
      {
        ...f,
        genres: arr(f.genres),
        tags: arr(f.tags),
        media: arr(f.media),
        rating: num(f.rating),
        chapter: num(f.chapter),
        total_chapters: num(f.total_chapters),
        read_url: f.read_url || null
      },
      chars
    );
  };
  const media = arr(f.media);
  const fin = ["done", "hiatus", "dropped"].includes(f.status);
  const showTot =
    tot || !!f.total_chapters || f.pub_status === "Completed" || f.status === "done";
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="drawer w-full max-w-xl h-full overflow-y-auto bg-paper dark:bg-night p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">
            {readOnly ? f.title : isNew ? "Add new series" : "Edit series"}
          </h2>
          <button onClick={onClose} className="text-2xl px-2" aria-label="Close">
            ×
          </button>
        </div>
        {isNew && (
          <div className="relative">
            <input
              className="inp"
              placeholder="Search AniList to auto-fill (e.g. Solo Leveling)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {(busy || res.length > 0) && (
              <div
                className={
                  "absolute z-10 mt-1 w-full max-h-80 overflow-y-auto " +
                  "rounded-xl bg-white dark:bg-[#221f33] shadow-xl"
                }
              >
                {busy && <p className="p-3 text-sm opacity-60">Searching…</p>}
                {res.map((r) => (
                  <button
                    key={r.anilist_id}
                    onClick={() => pick(r)}
                    className="flex gap-3 w-full text-left p-2 hover:bg-plum/10"
                  >
                    <img src={r.cover_url} className="w-10 h-14 object-cover rounded" />
                    <span>
                      <b>{r.title}</b>
                      <br />
                      <span className="text-xs opacity-60">
                        {r.format} · {r.genres.slice(0, 3).join(", ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!readOnly && !isNew && (
          <button
            onClick={fill}
            disabled={busy}
            className="w-full rounded-xl bg-plum/15 font-bold py-2 text-sm"
          >
            {busy ? "Looking up…" : "↻ Auto-fill missing info from AniList"}
          </button>
        )}
        <div className="flex gap-4">
          {f.cover_url && (
            <img
              src={f.cover_url}
              className="w-28 rounded-xl object-cover aspect-[2/3]"
            />
          )}
          <div className="flex-1 space-y-3">
            <L t="Title">
              <input
                className="inp"
                value={f.title}
                disabled={readOnly}
                onChange={(e) => set("title", e.target.value)}
              />
            </L>
            <L t="Cover image URL">
              <input
                className="inp"
                value={f.cover_url || ""}
                disabled={readOnly}
                onChange={(e) => set("cover_url", e.target.value)}
              />
            </L>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FORMATS.map((x) => (
            <button
              key={x}
              disabled={readOnly}
              onClick={() => set("format", x)}
              className={
                "rounded-full px-4 py-1.5 text-sm font-bold " +
                (f.format === x ? "bg-plum text-white" : "bg-plum/10")
              }
            >
              {x}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS.map(([k, l]) => (
            <button
              key={k}
              disabled={readOnly}
              onClick={() => setStatus(k)}
              className={
                "rounded-full px-4 py-1.5 text-sm font-bold " +
                (f.status === k
                  ? "bg-ink text-white dark:bg-white dark:text-ink"
                  : "bg-plum/10")
              }
            >
              {l}
            </button>
          ))}
        </div>
        {["reading", "hiatus", "dropped", "done"].includes(f.status) && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold">
                📖 {["hiatus", "dropped"].includes(f.status) ? "Stopped at chapter" : "Chapter"}
              </span>
              <span className="flex items-center gap-2">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setCh("chapter", (f.chapter || 0) - 1)}
                    className="h-9 w-9 rounded-full bg-plum/20 font-bold"
                    aria-label="Previous chapter"
                  >
                    −
                  </button>
                )}
                <input
                  type="number"
                  min="0"
                  className="inp !w-20 text-center"
                  disabled={readOnly}
                  value={f.chapter ?? ""}
                  onChange={(e) => setCh("chapter", e.target.value)}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setCh("chapter", (f.chapter || 0) + 1)}
                    className="h-9 w-9 rounded-full bg-plum/20 font-bold"
                    aria-label="Next chapter"
                  >
                    +
                  </button>
                )}
                {showTot && (
                  <>
                    <span className="opacity-60">/</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="?"
                      className="inp !w-20 text-center"
                      disabled={readOnly}
                      value={f.total_chapters ?? ""}
                      onChange={(e) => setCh("total_chapters", e.target.value)}
                    />
                  </>
                )}
              </span>
            </div>
            {f.total_chapters > 0 && (
              <input
                type="range"
                min="0"
                max={f.total_chapters}
                value={f.chapter || 0}
                disabled={readOnly}
                onChange={(e) => setCh("chapter", e.target.value)}
                className="w-full accent-plum"
              />
            )}
            {!readOnly &&
              (showTot ? (
                <p className="text-xs opacity-60">
                  Reaching the last chapter marks it Completed, and starting chapter 1 marks it Reading.
                </p>
              ) : (
                <p className="text-xs opacity-60">
                  No total needed while it is ongoing.{" "}
                  <button
                    type="button"
                    onClick={() => setTot(true)}
                    className="underline font-semibold"
                  >
                    Set total chapters
                  </button>
                </p>
              ))}
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl bg-plum/10 p-3">
          <div>
            <span className="text-sm font-semibold opacity-70">Excitement</span>
            <br />
            <Stars v={f.excitement} on={readOnly ? null : (v) => set("excitement", v)} />
          </div>
          {!readOnly && (
            <button
              onClick={() => set("priority", !f.priority)}
              className={
                "rounded-full px-4 py-2 font-bold " +
                (f.priority
                  ? "bg-amber-400 text-black"
                  : "bg-white/60 dark:bg-white/10")
              }
            >
              {f.priority ? "★ Top pick" : "☆ Mark as top pick"}
            </button>
          )}
        </div>
        <L t="🔗 Link to read it (add your own, friends can see it)">
          <div className="flex gap-2">
            <input
              className="inp"
              placeholder={
                readOnly
                  ? ""
                  : "Paste a link, or it is filled in when AniList lists an official source"
              }
              value={f.read_url || ""}
              disabled={readOnly}
              onChange={(e) => set("read_url", e.target.value)}
            />
            {/^https?:\/\//i.test(f.read_url || "") && (
              <a
                href={f.read_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-plum/15 px-3 grid place-items-center font-bold"
              >
                ↗
              </a>
            )}
          </div>
        </L>
        <L t="Series status (is it still being released?)">
          <select
            className="inp"
            value={f.pub_status || ""}
            disabled={readOnly}
            onChange={(e) => set("pub_status", e.target.value)}
          >
            <option value="">Not set</option>
            {PUB.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </L>
        <L t="Synopsis">
          <Auto
            className="inp"
            rows={4}
            value={f.synopsis || ""}
            disabled={readOnly}
            onChange={(e) => set("synopsis", e.target.value)}
          />
        </L>
        <L t="Genres (comma separated)">
          <input
            className="inp"
            value={f.genres}
            disabled={readOnly}
            onChange={(e) => set("genres", e.target.value)}
          />
        </L>
        <L t="Tropes and tags (e.g. Historical Romance, 90s Romance)">
          <input
            className="inp"
            value={f.tags}
            disabled={readOnly}
            onChange={(e) => set("tags", e.target.value)}
          />
        </L>
        <L t="Content / trigger warnings">
          <input
            className="inp"
            value={f.warnings || ""}
            disabled={readOnly}
            onChange={(e) => set("warnings", e.target.value)}
          />
        </L>
        {!readOnly && (
          <L t="Where did you find it? (TikTok, a friend, Reddit…)">
            <input
              className="inp"
              value={f.source || ""}
              onChange={(e) => set("source", e.target.value)}
            />
          </L>
        )}
        {!readOnly && (
          <L t="Moodboard: image or TikTok links, one per line">
            <textarea
              className="inp"
              rows={3}
              value={f.media}
              onChange={(e) => set("media", e.target.value)}
            />
          </L>
        )}
        {media.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {media.map((u) =>
              isImg(u) ? (
                <a key={u} href={u} target="_blank">
                  <img src={u} className="rounded-lg aspect-square object-cover w-full" />
                </a>
              ) : (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  className={
                    "rounded-lg aspect-square grid place-items-center " +
                    "bg-plum/10 text-sm font-bold p-2 text-center"
                  }
                >
                  ▶ Open video
                </a>
              )
            )}
          </div>
        )}
        <CharSection
          chars={chars}
          setChars={setChars}
          readOnly={readOnly}
          thoughts={thoughts}
          anilistId={f.anilist_id}
          title={f.title}
        />
        {fr && fr.length > 0 && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-2">
            <p className="font-bold">👥 Who else has this</p>
            {fr.map((x, i) => (
              <div key={i} className="flex gap-3">
                <Avatar url={x.avatar} name={x.name} size={32} />
                <div className="flex-1 text-sm">
                  <FriendLine x={x} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <L t="Personal notes / footnotes">
            <Auto
              className="inp"
              rows={3}
              value={f.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </L>
        )}
        <div
          className={
            "rounded-2xl p-4 space-y-3 transition " +
            (fin ? "bg-plum/15 ring-2 ring-plum/40" : "opacity-40")
          }
        >
          <p className="font-bold">
            {fin
              ? "Your verdict"
              : "Unlocks when you mark it Completed, Read on Hiatus or Dropped"}
          </p>
          <L t="Final rating (0–10)">
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              className="inp"
              disabled={readOnly || !fin}
              value={f.rating ?? ""}
              onChange={(e) => set("rating", e.target.value)}
            />
          </L>
          <L t="Review">
            <Auto
              className="inp"
              rows={4}
              disabled={readOnly || !fin}
              value={f.review || ""}
              onChange={(e) => set("review", e.target.value)}
            />
          </L>
        </div>
        {readOnly && onAdd && !(fr && fr.length) && (
          <button
            onClick={() => onAdd(item)}
            className="sticky bottom-3 w-full rounded-xl bg-plum text-white font-bold py-2.5 shadow-lg"
          >
            + Add to my Want to Read
          </button>
        )}
        {!readOnly && (
          <div className="flex flex-wrap gap-2 sticky bottom-0 py-3 bg-paper dark:bg-night">
            <button
              onClick={save}
              className="flex-1 rounded-xl bg-plum text-white font-bold py-2.5 hover:brightness-110"
            >
              {isNew ? "Add to my list" : "Save changes"}
            </button>
            {!isNew && (
              <button
                onClick={() => onShare(item)}
                className="rounded-xl bg-plum/15 px-4 font-bold"
              >
                Share rec
              </button>
            )}
            {!isNew && onRecommend && (
              <button
                onClick={() => onRecommend(item)}
                className="rounded-xl bg-plum/15 px-4 font-bold"
              >
                💌 Recommend
              </button>
            )}
            {!isNew && (
              <button
                onClick={() => confirm("Delete this series?") && onDelete(item)}
                className="rounded-xl bg-rose-500/15 text-rose-500 px-4 font-bold"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
