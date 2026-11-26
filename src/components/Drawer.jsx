import { useEffect, useRef, useState } from "react";
import { anilistDetail } from "../lib/anilist";
import { completeResult, searchSeries } from "../lib/seriesSearch";
import { forgetCustom, rememberCustom } from "../lib/customPresets";
import useOverlay from "../lib/useOverlay";
import { GENRE_PRESETS, joinTags, splitTags, TROPE_PRESETS } from "../lib/tags";
import {
  arr,
  blank,
  FORMATS,
  httpUrl,
  isHttp,
  isImg,
  isPlaceholderSynopsis,
  norm,
  num,
  proxyCover,
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
import TranslatorRecs from "./TranslatorRecs";

const L = ({ t, children }) => (
  <label className="block">
    <span className="text-sm font-semibold opacity-70">{t}</span>
    {children}
  </label>
);

const hasText = (value) => !!String(value ?? "").trim();
const sameLabel = (a, b) =>
  String(a || "")
    .trim()
    .toLowerCase() ===
  String(b || "")
    .trim()
    .toLowerCase();

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
  onReviewSave,
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
  notify,
  custom,
  outgoing = [],
  onWithdrawSent,
  translatorRecs = [],
  onSaveTranslator,
  onDeleteTranslator
}) {
  const isNew = !item.id;
  // Escape/Tab are handled by useOverlay; route its close through the same
  // review flush used by the × button and the backdrop.
  const requestCloseRef = useRef(null);
  const panelRef = useOverlay(
    () => (requestCloseRef.current ? requestCloseRef.current() : onClose()),
    readOnly ? "Series details" : isNew ? "Add new series" : "Edit series"
  );
  const mineEntry = (mine || []).find((row) => same(row, item));
  const [f, setF] = useState(() => ({
    ...blank,
    ...item,
    is_hidden: !!item.is_hidden,
    note: item.note || "",
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
  const savedReviewRef = useRef(String(item.review ?? ""));
  // Serialize review-only writes so blur and close cannot race each other.
  const reviewQueueRef = useRef(Promise.resolve());
  const pickSeq = useRef(0);
  const notice = notify || (() => {});
  useEffect(() => {
    fRef.current = f;
  }, [f]);
  const set = (k, v) =>
    setF((p) => {
      const next = { ...p, [k]: v };
      // Keep the ref in lockstep for blur/close/auto-save flushes.
      fRef.current = next;
      return next;
    });

  /** Flush only review text; a full drawer save still handles other fields. */
  const flushReview = () => {
    if (readOnly || isNew || typeof onReviewSave !== "function") {
      return Promise.resolve();
    }
    const next = reviewQueueRef.current.then(async () => {
      const latest = String(fRef.current.review ?? "");
      if (latest === savedReviewRef.current) return;
      const ok = await onReviewSave(item, latest);
      if (ok !== false) savedReviewRef.current = latest;
    });
    reviewQueueRef.current = next.catch(() => {});
    return next;
  };
  const requestClose = async () => {
    await flushReview();
    onClose();
  };
  requestCloseRef.current = requestClose;

  /**
   * One entry point for every source. Search rows and detail responses are
   * normalized before they reach here, so AniList, MangaUpdates, Kitsu,
   * WEBTOON, MangaDex and Comix all fill the same fields in exactly the same way.
   */
  const applyMetadataToForm = (metadata) => {
    if (!metadata) return;
    setF((prev) => {
      const next = { ...prev };
      if (hasText(metadata.anilist_id)) next.anilist_id = metadata.anilist_id;
      else if (metadata.anilist_id === null) next.anilist_id = null;
      if (hasText(metadata.title)) next.title = metadata.title;
      if (hasText(metadata.cover_url)) {
        next.cover_url = proxyCover(metadata.cover_url);
      }
      if (hasText(metadata.format)) next.format = metadata.format;
      const synopsis = String(metadata.synopsis || "");
      if (hasText(synopsis) && !isPlaceholderSynopsis(synopsis)) {
        next.synopsis = synopsis;
      }
      if (hasText(metadata.pub_status)) next.pub_status = metadata.pub_status;
      if (metadata.total_chapters != null) {
        next.total_chapters = metadata.total_chapters;
      }
      if (metadata.chapter != null) next.chapter = metadata.chapter;
      next.genres = joinTags([
        ...splitTags(next.genres),
        ...splitTags(metadata.genres)
      ]);
      next.tags = joinTags([
        ...splitTags(next.tags),
        ...splitTags(metadata.tags)
      ]);
      next.warnings = joinWarnings([next.warnings, metadata.warnings]);
      // Reading links are always the user's own choice; no API sets one.
      if (!hasText(next.read_url)) next.read_url = "";
      // Lookup metadata stays in drawer state only and is stripped on save.
      for (const key of [
        "_source_id",
        "_detail_url",
        "_webtoon_type",
        "_ageRating"
      ]) {
        if (metadata[key] !== undefined) next[key] = metadata[key];
      }
      if (metadata.source !== undefined) next._source = metadata.source;
      return next;
    });
  };

  const initialCustom = () => ({
    warnings: custom?.warnings || [],
    genres: custom?.genres || [],
    tags: custom?.tags || []
  });
  const [localCustom, setLocalCustom] = useState(initialCustom);
  useEffect(() => {
    setLocalCustom(initialCustom());
  }, [custom?.warnings, custom?.genres, custom?.tags]);
  const customWarnings = localCustom.warnings;
  const customGenres = localCustom.genres;
  const customTags = localCustom.tags;
  const customFields = {
    warnings: customWarnings,
    genres: customGenres,
    tags: customTags
  };
  const addCustom = (kind, label) => {
    if (!rememberCustom(kind, label)) return;
    setLocalCustom((prev) => ({
      ...prev,
      [kind]: [...prev[kind].filter((x) => !sameLabel(x, label)), label]
    }));
  };
  const removeCustom = (kind, label) => {
    forgetCustom(kind, label);
    setLocalCustom((prev) => ({
      ...prev,
      [kind]: prev[kind].filter((x) => !sameLabel(x, label))
    }));
    if (kind === "warnings") {
      set(
        "warnings",
        joinWarnings(
          parseWarnings(fRef.current.warnings).filter((x) => !sameLabel(x, label))
        )
      );
      setWarnTouched(true);
      return;
    }
    const field = kind === "genres" ? "genres" : "tags";
    set(
      field,
      joinTags(
        splitTags(fRef.current[field]).filter((x) => !sameLabel(x, label))
      )
    );
  };
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
        searchSeries(q, customFields)
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
  const markWarningsIfNew = (before, data) => {
    if (
      !parseWarnings(before.warnings).length &&
      parseWarnings(data?.warnings).length
    ) {
      markAutoWarnings(data.warnings);
    }
  };
  const pick = async (r) => {
    const seq = ++pickSeq.current;
    const before = fRef.current;
    applyMetadataToForm(r);
    markWarningsIfNew(before, r);
    setRes([]);
    setQ("");
    // Non-AniList rows carry their own source id. Their detail endpoint is
    // authoritative, and anilistDetail() is never called with a null id.
    if (r.anilist_id == null || r.anilist_id === "") {
      console.warn("Skipping AniList detail: picked series has no anilist_id.");
      const full = await completeResult(r, customFields);
      if (seq !== pickSeq.current || full === r) return;
      applyMetadataToForm(full);
      markWarningsIfNew(before, full);
      return;
    }
    try {
      const d = await anilistDetail(r.anilist_id, customFields);
      if (seq !== pickSeq.current) return;
      applyMetadataToForm(d);
      markWarningsIfNew(before, d);
      setChars((c) => (c.length ? c : d.chars));
    } catch (e) {
      // anilist.js logs real failures; keep the drawer usable.
    }
  };
  const fill = async () => {
    const before = fRef.current;
    if (before.anilist_id == null || before.anilist_id === "") {
      if (!before._source_id) {
        console.warn("Skipping auto-fill: no source id on this series.");
        return;
      }
      setBusy(true);
      try {
        const full = await completeResult(
          { ...before, source: before._source },
          customFields
        );
        applyMetadataToForm(full);
        markWarningsIfNew(before, full);
      } catch (e) {
        console.warn("Auto-fill failed:", e.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const d = await anilistDetail(before.anilist_id, customFields);
      applyMetadataToForm(d);
      markWarningsIfNew(before, d);
      setChars((c) => [
        ...c,
        ...d.chars.filter((x) => !c.some((y) => norm(y.name) === norm(x.name)))
      ]);
    } catch (e) {
      // anilist.js logs real failures; keep the drawer usable.
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const current = fRef.current;
    if (!String(current.title || "").trim()) return alert("Add a title first.");
    // A blur auto-save may already be in flight. Let it finish so the two
    // writes cannot race, then send the same latest text with the full form.
    await reviewQueueRef.current;
    const latest = fRef.current;
    const latestReview = String(latest.review ?? "");
    const reviewChanged = latestReview !== String(item.review ?? "");
    const {
      _source,
      _source_id,
      _detail_url,
      _webtoon_type,
      _ageRating,
      ...form
    } = latest;
    const ok = await onSave(
      {
        ...form,
        cover_url: httpUrl(latest.cover_url) || null,
        genres: splitTags(latest.genres),
        tags: splitTags(latest.tags),
        warnings: joinWarnings(latest.warnings),
        media: arr(latest.media).map(httpUrl).filter(Boolean),
        rating: num(latest.rating),
        chapter: num(latest.chapter),
        total_chapters: num(latest.total_chapters),
        read_url: httpUrl(latest.read_url) || null
      },
      chars,
      { reviewChanged }
    );
    if (ok !== false) savedReviewRef.current = latestReview;
  };
  const media = arr(f.media).map(httpUrl).filter(Boolean);
  const fin = ["done", "hiatus", "dropped"].includes(f.status);
  const showTot =
    tot || !!f.total_chapters || f.pub_status === "Completed" || f.status === "done";
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={readOnly ? "Series details" : isNew ? "Add new series" : "Edit series"}
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
          <button onClick={requestClose} className="text-2xl px-2" aria-label="Close">
            ×
          </button>
        </div>
        {isNew && (
          <div className="relative">
            <input
              className="inp"
              placeholder="Search titles (AniList, MangaUpdates, Kitsu, WEBTOON, MangaDex, Comix)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {(busy || !!q.trim()) && (
              <div
                className={
                  "absolute z-10 mt-1 w-full max-h-80 overflow-y-auto " +
                  "rounded-xl bg-white dark:bg-[#221f33] shadow-xl"
                }
              >
                {busy && <p className="p-3 text-sm opacity-60">Searching…</p>}
                {res.map((r) => (
                  <button
                    key={r.source + ":" + (r.anilist_id ?? norm(r.title))}
                    onClick={() => pick(r)}
                    className="flex gap-3 w-full text-left p-2 hover:bg-plum/10"
                  >
                    {r.cover_url ? (
                      <img
                        src={proxyCover(r.cover_url)}
                        alt={r.title + " cover"}
                        referrerPolicy="no-referrer"
                        className="w-10 h-14 object-cover rounded"
                      />
                    ) : (
                      <span className="w-10 h-14 rounded bg-plum/10" />
                    )}
                    <span className="min-w-0 flex-1">
                      <b>{r.title}</b>
                      <br />
                      <span className="text-xs opacity-60">
                        {r.format} · {r.genres.slice(0, 3).join(", ")}
                      </span>
                      <span
                        className={
                          "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold opacity-70 " +
                          (r.source === "WEBTOON"
                            ? "bg-blue-500/15"
                            : r.source === "MangaDex"
                              ? "bg-emerald-500/15"
                              : r.source === "Comix"
                                ? "bg-amber-500/15"
                                : "bg-plum/10")
                        }
                      >
                        {r.source}
                      </span>
                    </span>
                  </button>
                ))}
                {!!q.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setF({
                        ...blank,
                        title: q.trim(),
                        genres: "",
                        tags: "",
                        warnings: "",
                        media: ""
                      });
                      setChars([]);
                      setAutoWarnings("");
                      setWarnTouched(false);
                      setRes([]);
                      setQ("");
                    }}
                    className="w-full border-t border-plum/10 p-3 text-left text-sm font-bold text-plum hover:bg-plum/10"
                  >
                    {`+ Add "${q.trim()}" manually`}
                  </button>
                )}
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
            {busy ? "Looking up…" : "↻ Auto-fill missing info"}
          </button>
        )}
        <div className="flex gap-4">
          {isHttp(f.cover_url) && (
            <img
              src={proxyCover(f.cover_url)}
              referrerPolicy="no-referrer"
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
              placeholder={readOnly ? "" : "Paste your own http(s) link"}
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
          customPresets={customWarnings}
          value={f.warnings || ""}
          readOnly={readOnly}
          allowAdd={!readOnly}
          placeholder="+ Add custom warning"
          addLabel="Add"
          onAddCustom={(label) => addCustom("warnings", label)}
          onRemoveCustom={(label) => removeCustom("warnings", label)}
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
          customPresets={customGenres}
          value={f.genres || ""}
          readOnly={readOnly}
          allowAdd={!readOnly}
          placeholder="+ Add custom genre"
          addLabel="Add"
          onAddCustom={(label) => addCustom("genres", label)}
          onRemoveCustom={(label) => removeCustom("genres", label)}
          onChange={(value) => set("genres", value)}
        />
        <ChipPicker
          title="Tropes & tags"
          presets={TROPE_PRESETS}
          customPresets={customTags}
          value={f.tags || ""}
          readOnly={readOnly}
          allowAdd={!readOnly}
          placeholder="+ Add custom tag"
          addLabel="Add"
          onAddCustom={(label) => addCustom("tags", label)}
          onRemoveCustom={(label) => removeCustom("tags", label)}
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
        {!readOnly && outgoing.length > 0 && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-2">
            <p className="font-bold">💌 Sent recommendations</p>
            {outgoing.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 font-semibold">
                  Recommended to {row.name}
                </span>
                {onWithdrawSent && (
                  <button
                    type="button"
                    aria-label={"Withdraw recommendation to " + row.name}
                    title="Withdraw recommendation"
                    onClick={() => onWithdrawSent([row.id])}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-plum/15 font-bold hover:bg-plum/25"
                  >
                    ×
                  </button>
                )}
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
        {!readOnly && (
          <div className="rounded-2xl bg-plum/10 p-4 space-y-3">
            <div>
              <p className="font-bold">📝 Footnote</p>
              <p className="text-xs opacity-70">
                A private note for this series. It also appears on your card
                and is never shown to friends or on public share links.
              </p>
            </div>
            <L t="Footnote">
              <Auto
                className="inp"
                rows={3}
                value={f.note || ""}
                onChange={(e) => set("note", e.target.value)}
              />
            </L>
          </div>
        )}
        {!readOnly && (
          <div
            className="flex items-center gap-2 text-xs"
            title="Hidden titles stay off friends' lists and share links"
          >
            <span className="font-semibold opacity-70">Hide from friends</span>
            <button
              type="button"
              role="switch"
              aria-checked={!!f.is_hidden}
              aria-label="Hide from friends"
              onClick={() => set("is_hidden", !f.is_hidden)}
              className={
                "relative h-4 w-7 shrink-0 rounded-full transition " +
                (f.is_hidden ? "bg-plum" : "bg-plum/25")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition " +
                  (f.is_hidden ? "translate-x-3" : "")
                }
              />
            </button>
          </div>
        )}
        <TranslatorRecs
          rows={translatorRecs}
          seriesId={item.id}
          readOnly={readOnly}
          onSave={onSaveTranslator}
          onDelete={onDeleteTranslator}
          notify={notice}
        />
        <div className="rounded-2xl p-4 space-y-3 transition bg-plum/10">
          <p className="font-bold">Your verdict</p>
          <p className="text-xs opacity-60">
            Reviews save at any status. The final rating unlocks at Completed,
            Read on Hiatus or Dropped.
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
                  value={f.review || ""}
                  onChange={(e) => set("review", e.target.value)}
                  onBlur={(e) => {
                    // Clicking Save/blurring straight to it is handled by the
                    // full save below; every other blur flushes the review.
                    const next = e.relatedTarget;
                    const button = next?.closest?.("button");
                    if (
                      button &&
                      /Save changes|Add to my list/i.test(button.textContent || "")
                    ) {
                      return;
                    }
                    flushReview();
                  }}
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
