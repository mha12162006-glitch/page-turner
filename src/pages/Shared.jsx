import { useEffect, useRef, useState } from "react";
import {
  addFriend,
  findExistingSeries,
  isUniqueViolation,
  sb
} from "../lib/supabase";
import { relWith, same, STATUS } from "../lib/util";
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
  const [toast, setToast] = useState("");
  const toastTimer = useRef();
  const say = (m) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };
  useEffect(() => {
    const onNotice = (event) => {
      say(event.detail?.message || "AniList did not respond. Try again.");
    };
    window.addEventListener("anilist:notice", onNotice);
    return () => window.removeEventListener("anilist:notice", onNotice);
  }, []);
  const loadAll = () => {
    sb.from("profiles")
      .select("display_name,avatar_url,bio")
      .eq("user_id", uid)
      .maybeSingle()
      .then(({ data }) => setWho(data || {}));
    let q = sb.from("series").select("*").eq("user_id", uid).order("position");
    if (sid) q = q.eq("id", sid);
    q.then(({ data }) => setItems(data || []));
    sb.from("series_characters")
      .select("*")
      .eq("user_id", uid)
      .order("position")
      .then(({ data }) => setChs(data || []));
  };
  const loadRel = async () => {
    if (!me) return;
    const [a, b] = await Promise.all([
      sb.from("friendships").select("*"),
      sb.from("series").select("*").eq("user_id", me.id)
    ]);
    setRows(a.data || []);
    setMine(b.data || []);
  };
  useEffect(() => {
    loadAll();
    loadRel();
  }, [me?.id]);
  const clean = (s) => ({ ...s, notes: null, source: null, media: [] });
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
      ? mine
          .filter((y) => same(x, y))
          .map((y) => ({
            name: "You",
            status: y.status,
            rating: y.rating,
            review: y.review,
            notes: y.notes,
            priority: y.priority,
            chapter: y.chapter,
            total: y.total_chapters
          }))
      : [];
  const canAdd = !!me && me.id !== uid;
  const addWant = async (x) => {
    const row = {
      title: x.title,
      cover_url: x.cover_url,
      format: x.format,
      genres: [...(x.genres || [])],
      tags: [...(x.tags || [])],
      warnings: x.warnings || "",
      synopsis: x.synopsis || "",
      anilist_id: x.anilist_id,
      pub_status: x.pub_status,
      total_chapters: x.total_chapters,
      read_url: x.read_url
    };
    const dup = await findExistingSeries(me.id, row, mine);
    if (dup) {
      setDupe([dup]);
      return;
    }
    const { data, error } = await sb
      .from("series")
      .insert({
        ...row,
        status: "want",
        source: "From " + (who.display_name || "a friend") + " list",
        position: mine.reduce((m, i) => Math.max(m, i.position), -1) + 1
      })
      .select()
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await findExistingSeries(me.id, row, []);
        if (existing) {
          setDupe([existing]);
          return;
        }
      }
      console.error("Adding from a friend failed:", error);
      say("Could not add that series. Please try again.");
      return;
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
          charNote = "Added to your Want to Read. Characters could not be updated this time.";
        }
      } catch (err) {
        console.error("Saving characters failed:", err);
        charNote = "Added to your Want to Read. Characters could not be updated this time.";
      }
    }
    await loadRel();
    setOpen(null);
    say(charNote || "Added to your Want to Read.");
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
      ) : items.length === 0 ? (
        <p className="opacity-70">This list is private or empty.</p>
      ) : (
        STATUS.map(([k, l]) => {
          const g = items.filter((i) => i.status === k);
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
                      onAdd={canAdd ? addWant : undefined}
                      onOpen={(x) => setOpen(clean(x))}
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
          fr={youHave(open)}
          chars0={chs.filter((c) => c.series_id === open.id)}
          onAdd={canAdd ? addWant : undefined}
          onClose={() => setOpen(null)}
          notify={say}
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
          onOpen={(s) => setOpen(s)}
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
