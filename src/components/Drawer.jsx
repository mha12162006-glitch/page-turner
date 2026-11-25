import { useEffect, useRef, useState } from "react";
import { anilistDetail, searchAniList } from "../lib/anilist";
import { GENRE_PRESETS, joinTags, splitTags, TROPE_PRESETS } from "../lib/tags";
import {
  arr,
  blank,
  FORMATS,
  httpUrl,
  isHttp,
  isImg,
  norm,
  num,
  PUB,
  same,
  STATUS,
  statusLabel
} from "../lib/util";
import {
  joinWarnings,
  parseWarnings,
  WARNING_PRESETS
} from "../lib/warnings";
import Avatar from "./Avatar";
import CharSection from "./CharSection";
import ChipPicker from "./ChipPicker";
import { FriendLine } from "./Card";
import SpoilerText from "./SpoilerText";
import Stars from "./Stars";

const L = ({ t, children }) => (
  <label className="block">
    <span className="text-sm font-semibold opacity-70">{t}</span>
    {children}
  </label>
);

const hasText = (value) => !!String(value ?? "").trim();

function mergeMissing(row, data) {
  if (!data) return row;
  const next = { ...row };
  if (!hasText(next.cover_url) && hasText(data.cover_url)) {
    next.cover_url = data.cover_url;
  }
  if (!hasText(next.synopsis) && hasText(data.synopsis)) {
    next.synopsis = data.synopsis;
  }
  if (!hasText(next.pub_status) && hasText(data.pub_status)) {
    next.pub_status = data.pub_status;
  }
  if (!splitTags(next.genres).length && splitTags(data.genres).length) {
    next.genres = joinTags(data.genres);
  }
  if (!splitTags(next.tags).length && splitTags(data.tags).length) {
    next.tags = joinTags(data.tags);
  }
  if (!parseWarnings(next.warnings).length && hasText(data.warnings)) {
    next.warnings = joinWarnings(data.warnings);
  }
  if (next.total_chapters == null && data.total_chapters != null) {
    next.total_chapters = data.total_chapters;
  }
  if (!hasText(next.read_url) && hasText(data.read_url)) {
    next.read_url = data.read_url;
  }
  return next;
}

function mergePick(row, result) {
  const next = {
    ...row,
    anilist_id: result.anilist_id,
    title: result.title || row.title,
    cover_url: result.cover_url || row.cover_url,
    format: result.format || row.format,
    pub_status: result.pub_status || row.pub_status
  };
  return mergeMissing(next, result);
}

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
  onOpenMine,
  readOnly,
  friend,
  friendView,
  mine,
  recommendations,
  fr,
  chars0,
  thoughts,
  notify
}) {
  const isNew = !item.id;
  const mineEntry = (mine || []).find((row) => same(row, item));
  const [f, setF] = useState(() => ({
    ...blank,
    ...item,
    is_hidden: !!item.is_hidden,
    genres: joinTags(item.genres),
    tags: joinTags(item.tags),
    warnings: joinWarnings(item.warnings),
    media: (item.media || []).join("\n")
  }));
  const [chars, setChars] = useState(chars0 || []);
  const [tot, setTot] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [autoWarnings, setAutoWarnings] = useState("");
  const [warnTouched, setWarnTouched] = useState(false);
  const fRef = useRef(f);
  const notice = notify || (() => {});
  useEffect(() => {
    fRef.current = f;
  }, [f]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const markAutoWarnings = (value) => {
    const clean = joinWarnings(value);
    if (!clean) return;
    setAutoWarnings(clean);
    setWarnTouched(false);
  };
  useEffect(() => {
    if (!isNew || q.length < 3) return setRes([]);
    setBusy(true);
    let live = true;
    const t = setTimeout(
      () =>
        searchAniList(q)
          .then((rows) => live && setRes(rows))
          .catch(() => live && setRes([]))
          .finally(() => live && setBusy(false)),
      400
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
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
    const before = fRef.current;
    setF((p) => mergePick(p, r));
    if (
      !parseWarnings(before.warnings).length &&
      parseWarnings(r.warnings).length
    ) {
      markAutoWarnings(r.warnings);
    }
    setRes([]);
    setQ("");
    anilistDetail(r.anilist_id)
      .then((d) => {
        const latest = fRef.current;
        setF((p) => mergeMissing(p, d));
        if (
          !parseWarnings(latest.warnings).length &&
          parseWarnings(d.warnings).length
        ) {
          markAutoWarnings(d.warnings);
        }
        setChars((c) => (c.length ? c : d.chars));
      })
      .catch(() => {});
  };
  const fill = async () => {
    setBusy(true);
    try {
      let id = f.anilist_id;
      let base = null;
      if (!id) {
        const r = (await searchAniList(f.title))[0];
        if (!r) {
          notice("Could not find this title on AniList.");
          return;
        }
        id = r.anilist_id;
        base = r;
        const before = fRef.current;
        setF((p) => ({ ...mergeMissing(p, base), anilist_id: id }));
        if (
          !parseWarnings(before.warnings).length &&
          parseWarnings(base.warnings).length
        ) {
          markAutoWarnings(base.warnings);
        }
      }
      const d = await anilistDetail(id);
      const latest = fRef.current;
      setF((p) => mergeMissing(p, d));
      if (
        !parseWarnings(latest.warnings).length &&
        parseWarnings(d.warnings).length
      ) {
        markAutoWarnings(d.warnings);
      }
      setChars((c) => [
        ...c,
        ...d.chars.filter((x) => !c.some((y) => norm(y.name) === norm(x.name)))
      ]);
    } catch (e) {
      // anilist.js announces failures; keep the drawer usable.
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!f.title.trim()) return alert("Add a title first.");
    onSave(
      {
        ...f,
        cover_url: httpUrl(f.cover_url) || null,
        genres: splitTags(f.genres),
        tags: splitTags(f.tags),
        warnings: joinWarnings(f.warnings),
        media: arr(f.media).map(httpUrl).filter(Boolean),
        rating: num(f.rating),
        chapter: num(f.chapter),
        total_chapters: num(f.total_chapters),
        read_url: httpUrl(f.read_url) || null
      },
      chars
    );
  };
  const media = arr(f.media).map(httpUrl).filter(Boolean);
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold">
              {readOnly ? f.title : isNew ? "Add new series" : "Edit series"}
            </h2>
            {readOnly && friendView && friend?.name && (
              <p className="text-sm opacity-70">From {friend.name}’s list</p>
            )}
          </div>
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
          {isHttp(f.cover_url) && (
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
        {!readOnly && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-plum/10 p-3">
            <div>
              <p className="font-bold">🔒 Hide from friends</p>
              <p className="text-xs opacity-70">
                Hidden titles stay on your list but never appear in friends’
                search, your friend profile, recommendations or public share
                links.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!f.is_hidden}
              aria-label="Hide from friends"
              onClick={() => set("is_hidden", !f.is_hidden)}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition " +
                (f.is_hidden ? "bg-plum" : "bg-plum/25")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition " +
                  (f.is_hidden ? "translate-x-5" : "")
                }
              />
            </button>
          </div>
        )}
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
        <ChipPicker
          title="Content / trigger warnings"
          presets={WARNING_PRESETS}
          value={f.warnings || ""}
          readOnly={readOnly}
          allowAdd={!readOnly}
          placeholder="+ Add custom warning"
          addLabel="Add"
          hint={
            readOnly
              ? ""
              : "No warnings auto-detected — select any that apply"
          }
          note={
            autoWarnings &&
            !warnTouched &&
            f.warnings === autoWarnings
              ? "auto-filled, please check"
              : ""
          }
          onChange={(value) => {
            setWarnTouched(true);
            set("warnings", value);
          }}
        />
        <ChipPicker
          title="Genres"
          presets={GENRE_PRESETS}
          value={f.genres || ""}
          readOnly={readOnly}
          allowAdd={false}
          onChange={(value) => set("genres", value)}
        />
        <ChipPicker
          title="Tropes & tags"
          presets={TROPE_PRESETS}
          value={f.tags || ""}
          readOnly={readOnly}
          allowAdd={!readOnly}
          placeholder="+ Add custom tag"
          addLabel="Add"
          onChange={(value) => set("tags", value)}
        />
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
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src={u} className="rounded-lg aspect-square object-cover w-full" />
                </a>
              ) : (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
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
        {readOnly && recommendations && recommendations.length > 0 && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-1">
            <p className="font-bold">💌 Translator recommendation</p>
            <p className="text-sm">
              {friend?.name || "This friend"} recommended this series to you.
            </p>
          </div>
        )}
        {readOnly && friendView && f.source && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-1">
            <p className="font-bold">🔎 Found via</p>
            <p className="text-sm break-words whitespace-pre-line">
              {f.source}
            </p>
          </div>
        )}
        {readOnly && friendView && f.notes && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-1">
            <p className="font-bold">📝 Footnote</p>
            <p className="text-sm break-words whitespace-pre-line">
              {f.notes}
            </p>
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
          {readOnly ? (
            <div className="block">
              <span className="text-sm font-semibold opacity-70">Review</span>
              {f.review ? (
                <p className="mt-1 break-words whitespace-pre-line">
                  <SpoilerText text={f.review} />
                </p>
              ) : (
                <p className="mt-1 text-sm opacity-60">No review yet.</p>
              )}
            </div>
          ) : (
            <>
              <L t="Review">
                <Auto
                  className="inp"
                  rows={4}
                  disabled={!fin}
                  value={f.review || ""}
                  onChange={(e) => set("review", e.target.value)}
                />
              </L>
              <p className="text-xs opacity-60">
                Put spoilers in [square brackets]
              </p>
              <div className="rounded-xl bg-plum/10 p-3 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide opacity-60">
                  Live preview
                </p>
                <p className="mt-1 break-words whitespace-pre-line">
                  {f.review ? (
                    <SpoilerText text={f.review} />
                  ) : (
                    <span className="opacity-60">
                      Your review preview will appear here.
                    </span>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
        {readOnly && mineEntry && (
          <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-plum/15 p-3 shadow-lg">
            <p className="font-bold">
              On your list as {statusLabel(mineEntry.status)}
            </p>
            {onOpenMine && (
              <button
                onClick={() => onOpenMine(mineEntry)}
                className="rounded-full bg-plum text-white font-bold px-4 py-1.5"
              >
                Open it
              </button>
            )}
          </div>
        )}
        {readOnly && !mineEntry && onAdd && (
          <button
            onClick={() => onAdd(item)}
            className="sticky bottom-3 w-full rounded-xl bg-plum text-white font-bold py-2.5 shadow-lg"
          >
            + Add to my list
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
