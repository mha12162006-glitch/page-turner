import { useEffect, useRef, useState } from "react";
import {
  addFriend,
  findExistingSeries,
  isUniqueViolation,
  sb,
  SHARED_SERIES_COLUMNS
} from "../lib/supabase";
import { FORMATS, relWith, same, STATUS, statusLabel } from "../lib/util";
import { latestPerSeries, seriesKey } from "../lib/search";
import AddFromFriend from "../components/AddFromFriend";
import AlreadyOnList from "../components/AlreadyOnList";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import Drawer from "../components/Drawer";

export default function Shared({ uid, sid, dark, setDark, me }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [who, setWho] = useState({});
  const [rows, setRows] = useState([]);
  const [mine, setMine] = useState([]);
  const [chs, setChs] = useState([]);
  const [dupe, setDupe] = useState(null);
  const [addFor, setAddFor] = useState(null);
  const [toast, setToast] = useState("");
  const [format, setFormat] = useState("");
  const toastTimer = useRef();
  const say = (m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };
  const loadAll = async () => {
    sb.from("profiles")
      .select("display_name,avatar_url,bio")
      .eq("user_id", uid)
      .maybeSingle()
      .then(({ data }) => setWho(data || {}));
    let q = sb
      .from("series")
      .select(SHARED_SERIES_COLUMNS)
      .eq("user_id", uid)
      .eq("is_hidden", false)
      .order("position");
    if (sid) q = q.eq("id", sid);
    const [seriesResult, charsResult] = await Promise.all([
      q,
      sb
        .from("series_characters")
        .select("id,user_id,series_id,name,image_url,comment,position")
        .eq("user_id", uid)
        .order("position")
    ]);
    const allRows = seriesResult.data || [];
    const list = latestPerSeries(allRows);
    setItems(list);
    const visibleKeys = new Set(list.map(seriesKey));
    const keyById = new Map(allRows.map((row) => [row.id, seriesKey(row)]));
    setChs(
      (charsResult.data || []).filter((row) =>
        visibleKeys.has(keyById.get(row.series_id))
      )
    );
  };
  const loadRel = async () => {
    if (!me) return;
    const [a, b] = await Promise.all([
      sb.from("friendships").select("*"),
      sb
        .from("series")
        .select(SHARED_SERIES_COLUMNS)
        .eq("user_id", me.id)
    ]);
    setRows(a.data || []);
    setMine(b.data || []);
  };
  useEffect(() => {
    setItems(null);
    setWho({});
    setRows([]);
    setMine([]);
    setChs([]);
    setOpen(null);
    setAddFor(null);
    setDupe(null);
    setFormat("");
    loadAll();
    loadRel();
  }, [uid, sid, me?.id]);
  const rel = me ? relWith(rows, me.id, uid) : null;
  const doAdd = async () => {
    const { error } = await addFriend(me.id, uid, rows);
    if (error) {
      console.error("Adding friend failed:", error);
      return say("Could not add that friend. Please try again.");
    }
    await loadRel();
    loadAll();
  };
  const youHave = (x) =>
    me && me.id !== uid
      ? latestPerSeries(mine)
          .filter((y) => same(x, y))
          .map((y) => ({
            name: "You",
            isMe: true,
            status: y.status,
            rating: y.rating,
            review: y.review,
            priority: y.priority,
            chapter: y.chapter,
            total: y.total_chapters
          }))
      : [];
  const canAdd = !!me && me.id !== uid;
  const shown = (items || []).filter((i) => !format || i.format === format);
  const openMine = (series) => {
    if (series?.id) {
      try {
        sessionStorage.setItem("mt-open-series", series.id);
      } catch (err) {
        // Private browsing can block storage; the home page still opens.
      }
    }
    setOpen(null);
    setAddFor(null);
    setDupe(null);
    location.hash = "#/";
  };
  const addFromFriend = async (x, { status, chapter } = {}) => {
    if (!me || !x) return false;
    const row = {
      title: x.title,
      cover_url: x.cover_url || null,
      format: x.format || "Manhwa",
      genres: [...(x.genres || [])],
      tags: [...(x.tags || [])],
      warnings: x.warnings || "",
      synopsis: x.synopsis || "",
      anilist_id: x.anilist_id ?? null,
      pub_status: x.pub_status || "",
      total_chapters: x.total_chapters ?? null,
      read_url: x.read_url || null
    };
    const dup = await findExistingSeries(me.id, row, mine);
    if (dup) {
      setAddFor(null);
      setDupe([dup]);
      return false;
    }
    const { data, error } = await sb
      .from("series")
      .insert({
        ...row,
        status: status || "want",
        chapter: chapter == null ? null : chapter,
        source: "From " + (who.display_name || "a friend") + " list",
        position: mine.reduce((m, i) => Math.max(m, i.position), -1) + 1
      })
      .select("id")
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await findExistingSeries(me.id, row, []);
        if (existing) {
          setAddFor(null);
          setDupe([existing]);
          return false;
        }
      }
      console.error("Adding from a friend failed:", error);
      say("Could not add that series. Please try again.");
      return false;
    }
    const cs = chs.filter((c) => c.series_id === x.id);
    let charNote = "";
    if (cs.length) {
      try {
        const ce = await sb.from("series_characters").insert(
          cs.map((c, k) => ({
            user_id: me.id,
            series_id: data.id,
            name: c.name,
            image_url: c.image_url || null,
            position: k
          }))
        );
        if (ce.error) {
          console.error("Saving characters failed:", ce.error);
          charNote = "Characters could not be copied this time.";
        }
      } catch (err) {
        console.error("Saving characters failed:", err);
        charNote = "Characters could not be copied this time.";
      }
    }
    await loadRel();
    setOpen(null);
    setAddFor(null);
    say(charNote || "Added to " + statusLabel(status || "want") + ".");
    return true;
  };
  const pill = "rounded-full bg-plum/15 font-bold px-4 py-2";
  const friendBtn =
    me === undefined || me?.id === uid ? null : !me ? (
      <a href={location.href.split("#")[0]} className={pill}>
        Sign in to add friend
      </a>
    ) : rel?.status === "accepted" ? (
      <span className={pill}>✓ Friends</span>
    ) : rel?.dir === "out" ? (
      <span className={pill}>Request sent</span>
    ) : (
      <button
        onClick={doAdd}
        className="rounded-full bg-plum text-white font-bold px-5 py-2"
      >
        {rel ? "Accept friend request" : "+ Add friend"}
      </button>
    );
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row gap-4 justify-between items-center text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Avatar url={who.avatar_url} name={who.display_name} size={56} />
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">
              {sid
                ? "A recommendation from " + (who.display_name || "a friend")
                : who.display_name
                  ? who.display_name + "’s reading list"
                  : "A reading list to browse"}
            </h1>
            {who.bio && <p className="opacity-70">{who.bio}</p>}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-center">
          {items && (
            <select
              aria-label="Category"
              className="inp sm:!w-auto"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="">All categories</option>
              {FORMATS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
          {me && (
            <a href="#/" className={pill}>
              ← My list
            </a>
          )}
          {friendBtn}
          <button onClick={() => setDark(!dark)} className={pill}>
            {dark ? "☀" : "☾"}
          </button>
        </div>
      </header>
      {items === null ? (
        <p>Loading…</p>
      ) : shown.length === 0 ? (
        <p className="opacity-70">
          {format ? "Nothing in this category." : "This list is private or empty."}
        </p>
      ) : (
        STATUS.map(([k, l]) => {
          const g = shown.filter((i) => i.status === k);
          return (
            g.length > 0 && (
              <section key={k}>
                <h2 className="text-xl font-bold mb-3">{l}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                  {g.map((s) => (
                    <Card
                      key={s.id}
                      s={s}
                      readOnly
                      fr={youHave(s)}
                      onAdd={canAdd ? (x) => setAddFor(x) : undefined}
                      onOpen={(x) => setOpen(x)}
                    />
                  ))}
                </div>
              </section>
            )
          );
        })
      )}
      {open && (
        <Drawer
          key={open.id || "new"}
          item={open}
          readOnly
          friend={who}
          friendView={!!me && me.id !== uid}
          mine={mine}
          fr={youHave(open)}
          chars0={chs.filter((c) => c.series_id === open.id)}
          onAdd={canAdd ? (x) => setAddFor(x) : undefined}
          onOpenMine={openMine}
          onClose={() => setOpen(null)}
          notify={say}
        />
      )}
      {addFor && (
        <AddFromFriend
          source={addFor}
          mine={mine}
          friendName={who.display_name || "a friend"}
          onAdd={(choice) => addFromFriend(addFor, choice)}
          onOpen={openMine}
          onClose={() => setAddFor(null)}
        />
      )}
      <p className="text-sm opacity-60">
        <a className="underline" href={location.href.split("#")[0]}>
          Make your own list
        </a>
      </p>
      {dupe && (
        <AlreadyOnList
          items={dupe}
          onOpen={openMine}
          onClose={() => setDupe(null)}
        />
      )}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 max-w-[90vw] pointer-events-none rounded-full bg-ink text-white text-center px-5 py-2 pop"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
