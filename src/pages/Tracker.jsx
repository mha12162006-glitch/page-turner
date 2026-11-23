import { useEffect, useMemo, useRef, useState } from "react";
import { enrich } from "../lib/anilist";
import { addFriend, sb } from "../lib/supabase";
import {
  applyF,
  blank,
  emptyF,
  malImport,
  norm,
  readMalFile,
  same,
  STATUS,
  TABS
} from "../lib/util";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import Drawer from "../components/Drawer";
import Filters from "../components/Filters";
import FriendsPanel from "../components/FriendsPanel";
import Logo from "../components/Logo";
import ProfilePanel from "../components/ProfilePanel";
import RecModal from "../components/RecModal";
import RecsView from "../components/RecsView";
import ThemePanel from "../components/ThemePanel";

export default function Tracker({ user, dark, setDark, th }) {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("reading");
  const [f, setF] = useState(emptyF);
  const [open, setOpen] = useState(null);
  const [toast, setToast] = useState("");
  const [panel, setPanel] = useState(false);
  const [prof, setProf] = useState({});
  const [pp, setPP] = useState(false);
  const [frs, setFrs] = useState([]);
  const [fp, setFp] = useState({});
  const [fs, setFs] = useState([]);
  const [fpanel, setFpanel] = useState(false);
  const [recs, setRecs] = useState([]);
  const [recFor, setRecFor] = useState(null);
  const [mychars, setMychars] = useState([]);
  const [fc, setFc] = useState([]);
  const dragIdx = useRef(null);
  const fileRef = useRef();
  const load = async () => {
    const { data } = await sb
      .from("series")
      .select("*")
      .eq("user_id", user.id)
      .order("position");
    setItems(data || []);
    const cc = await sb
      .from("series_characters")
      .select("*")
      .eq("user_id", user.id)
      .order("position");
    setMychars(cc.data || []);
  };
  useEffect(() => {
    load();
    const ch = sb
      .channel("series-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "series",
          filter: "user_id=eq." + user.id
        },
        load
      )
      .subscribe();
    return () => sb.removeChannel(ch);
  }, []);
  useEffect(() => {
    sb.from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setProf(data || {}));
  }, []);
  const say = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2500);
  };
  const save = async (s, chs0 = []) => {
    const { id, created_at, user_id, ...r0 } = s;
    let rest = r0;
    let chs = chs0;
    if (!rest.synopsis || !(rest.genres || []).length) {
      say("Filling in details…");
      const e = await enrich(rest);
      rest = e.row;
      if (!chs.length && !id) chs = e.chars;
    }
    const r = id
      ? await sb.from("series").update(rest).eq("id", id).select().single()
      : await sb
          .from("series")
          .insert({
            ...rest,
            position: Math.max(-1, ...items.map((i) => i.position)) + 1
          })
          .select()
          .single();
    if (r.error) return alert(r.error.message);
    const sid = r.data.id;
    await sb.from("series_characters").delete().eq("series_id", sid);
    if (chs.length) {
      const ce = await sb.from("series_characters").insert(
        chs.map((c, k) => ({
          series_id: sid,
          name: c.name,
          image_url: c.image_url || null,
          comment: c.comment || null,
          position: k
        }))
      );
      if (ce.error) alert("Saved, but characters failed: " + ce.error.message);
    }
    setOpen(null);
    load();
    say(id ? "Saved" : "Added");
  };
  const saveProf = async (p) => {
    const { error } = await sb.from("profiles").upsert({ user_id: user.id, ...p });
    if (error) return alert(error.message);
    setProf((x) => ({ ...x, ...p }));
    setPP(false);
    say("Profile saved");
  };
  const del = async (s) => {
    await sb.from("series").delete().eq("id", s.id);
    setOpen(null);
    load();
  };
  const loadFriends = async () => {
    const { data } = await sb.from("friendships").select("*");
    const rows = data || [];
    setFrs(rows);
    const oth = (r) => (r.requester === user.id ? r.addressee : r.requester);
    const ids = rows.map(oth);
    const acc = rows.filter((r) => r.status === "accepted").map(oth);
    if (!ids.length) {
      setFp({});
      setFs([]);
      return;
    }
    const [a, b, c] = await Promise.all([
      sb.from("profiles").select("*").in("user_id", ids),
      acc.length ? sb.from("series").select("*").in("user_id", acc) : { data: [] },
      acc.length
        ? sb.from("series_characters").select("*").in("user_id", acc)
        : { data: [] }
    ]);
    setFp(Object.fromEntries((a.data || []).map((x) => [x.user_id, x])));
    setFs(b.data || []);
    setFc(c.data || []);
  };
  useEffect(() => {
    loadFriends();
    const ch = sb
      .channel("fr-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, loadFriends)
      .subscribe();
    return () => sb.removeChannel(ch);
  }, []);
  const friendHas = (x) =>
    fs
      .filter((y) => same(x, y))
      .map((y) => ({
        name: fp[y.user_id]?.display_name || "A friend",
        avatar: fp[y.user_id]?.avatar_url,
        status: y.status,
        rating: y.rating,
        review: y.review,
        notes: y.notes,
        priority: y.priority,
        chapter: y.chapter,
        total: y.total_chapters
      }));
  const thoughts = (sr) => (c) => {
    const ids = fs.filter((y) => same(sr, y)).map((y) => y.id);
    return fc
      .filter(
        (x) =>
          ids.includes(x.series_id) &&
          x.comment &&
          norm(x.name) === norm(c.name)
      )
      .map((x) => ({
        name: fp[x.user_id]?.display_name || "A friend",
        comment: x.comment
      }));
  };
  const loadRecs = async () => {
    const { data } = await sb
      .from("recommendations")
      .select("*, series(*)")
      .eq("to_user", user.id)
      .order("created_at", { ascending: false });
    setRecs((data || []).filter((r) => r.series));
  };
  useEffect(() => {
    loadRecs();
    const ch = sb
      .channel("rec-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recommendations" },
        loadRecs
      )
      .subscribe();
    return () => sb.removeChannel(ch);
  }, []);
  const friendList = frs
    .filter((r) => r.status === "accepted")
    .map((r) => {
      const uid = r.requester === user.id ? r.addressee : r.requester;
      return {
        uid,
        name: fp[uid]?.display_name || "Friend",
        avatar: fp[uid]?.avatar_url
      };
    });
  const sendRec = async (uid) => {
    const { error } = await sb
      .from("recommendations")
      .insert({ to_user: uid, series_id: recFor.id });
    if (error && error.code !== "23505") {
      alert(error.message);
      return false;
    }
    return true;
  };
  const addRec = async (r, name) => {
    say("Adding…");
    const x = r.series;
    const { row, chars } = await enrich({
      title: x.title,
      cover_url: x.cover_url,
      format: x.format,
      genres: x.genres,
      tags: x.tags,
      warnings: x.warnings,
      synopsis: x.synopsis,
      anilist_id: x.anilist_id,
      pub_status: x.pub_status,
      total_chapters: x.total_chapters,
      read_url: x.read_url
    });
    const { data, error } = await sb
      .from("series")
      .insert({
        ...row,
        status: "want",
        source: "Recommended by " + name,
        position: Math.max(-1, ...items.map((i) => i.position)) + 1
      })
      .select()
      .single();
    if (error) return alert(error.message);
    const src = fc.filter((c) => c.series_id === x.id);
    const cs = src.length ? src : chars;
    if (cs.length) {
      await sb.from("series_characters").insert(
        cs.map((c, k) => ({
          series_id: data.id,
          name: c.name,
          image_url: c.image_url || null,
          position: k
        }))
      );
    }
    load();
    say("Added to Want to Read");
  };
  const dismissRec = async (r) => {
    await sb.from("recommendations").delete().eq("id", r.id);
    loadRecs();
  };
  const incoming = frs.filter(
    (r) => r.status === "pending" && r.addressee === user.id
  ).length;
  const fAct = async (a, r) => {
    const { error } = await (a === "accept"
      ? sb.from("friendships").update({ status: "accepted" }).eq("id", r.id)
      : sb.from("friendships").delete().eq("id", r.id));
    if (error) alert(error.message);
    loadFriends();
  };
  const fAdd = async (txt) => {
    const m = txt.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (!m) return alert("That does not look like a share link.");
    const uid = m[0].toLowerCase();
    if (uid === user.id) return alert("That is your own link.");
    const { error } = await addFriend(user.id, uid, frs);
    if (error) return alert(error.message);
    say("Friend request sent");
    loadFriends();
  };
  const link = async (id) => {
    await sb.from("profiles").upsert({ user_id: user.id, is_public: true });
    const url =
      location.href.split("#")[0] + "#/share/" + user.id + (id ? "/" + id : "");
    await navigator.clipboard
      .writeText(url)
      .catch(() => prompt("Copy this link", url));
    say("Link copied");
  };
  const visible = useMemo(
    () => applyF(items.filter((i) => (tab === "active" ? i.status !== "done" : i.status === tab)), f),
    [items, tab, f]
  );
  const canDrag = f === emptyF || JSON.stringify(f) === JSON.stringify(emptyF);
  const drop = async (to) => {
    const from = dragIdx.current;
    if (from == null || from === to) return;
    const list = [...visible];
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    const pos = list.map((x, i) => ({ id: x.id, position: i }));
    setItems((p) =>
      p
        .map((x) => ({
          ...x,
          position: pos.find((y) => y.id === x.id)?.position ?? x.position
        }))
        .sort((a, b) => a.position - b.position)
    );
    await Promise.all(
      pos.map((p) => sb.from("series").update({ position: p.position }).eq("id", p.id))
    );
    load();
  };
  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let xml;
    try {
      xml = await readMalFile(file);
    } catch (err) {
      return alert(
        "Could not read that file. Try unzipping it first and choosing the .xml file inside."
      );
    }
    const { rows, anime } = malImport(xml, user.id);
    if (!rows.length) {
      return alert(
        anime
          ? "That looks like your anime list. Please choose your manga list file instead (it has manga in its name)."
          : "No manga entries found. Make sure you chose the manga list export from MyAnimeList."
      );
    }
    const { error } = await sb
      .from("series")
      .insert(rows.map((r, i) => ({ ...r, position: items.length + i })));
    error ? alert(error.message) : (say("Imported " + rows.length + " titles"), load());
  };
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Manhwa Tracker
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap justify-center sm:justify-end items-center">
          <button
            onClick={() => setOpen({ ...blank, status: "want" })}
            className="rounded-full bg-plum text-white font-bold px-5 py-2 hover:brightness-110"
          >
            + Add series
          </button>
          <button
            onClick={() => link()}
            className="rounded-full bg-plum/15 font-bold px-4 py-2"
          >
            Share my list
          </button>
          <button
            onClick={() => setFpanel(true)}
            className="rounded-full bg-plum/15 font-bold px-4 py-2"
          >
            👥 Friends
            {incoming > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500 text-white text-xs px-1.5 py-0.5">
                {incoming}
              </span>
            )}
          </button>
          <button
            onClick={() => setPanel(true)}
            className="rounded-full bg-plum/15 font-bold px-4 py-2"
          >
            🎨 Theme
          </button>
          <button
            onClick={() => sb.auth.signOut()}
            className="rounded-full px-3 py-2 text-sm opacity-70 underline"
          >
            Sign out
          </button>
          <button
            onClick={() => setPP(true)}
            className="rounded-full ring-2 ring-plum/40 hover:ring-plum transition"
            aria-label="My profile"
          >
            <Avatar
              url={prof.avatar_url}
              name={prof.display_name || user.email}
              size={40}
            />
          </button>
        </div>
      </header>
      <nav className="flex gap-2 flex-wrap justify-center sm:justify-start">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              "rounded-full px-3 sm:px-5 py-1.5 sm:py-2 text-sm sm:text-base font-bold transition " +
              (k === "dropped" ? "sm:ml-auto " : "") +
              (tab === k
                ? "bg-ink text-white dark:bg-white dark:text-ink"
                : "bg-plum/10")
            }
          >
            {l}{" "}
            <span className="opacity-60">
              {k === "recs"
                ? recs.length
                : items.filter((i) =>
                    k === "active" ? i.status !== "done" : i.status === k
                  ).length}
            </span>
          </button>
        ))}
      </nav>
      {tab !== "recs" && <Filters f={f} setF={setF} items={items} />}
      {tab !== "done" && canDrag && visible.length > 1 && (
        <p className="text-sm opacity-60 text-center sm:text-left">
          Drag cards to set your reading order. It saves automatically.
        </p>
      )}
      {tab === "recs" ? (
        <RecsView
          recs={recs}
          fp={fp}
          items={items}
          onAdd={addRec}
          onDismiss={dismissRec}
        />
      ) : visible.length === 0 ? (
        <div className="text-center py-24 opacity-70">
          <p className="text-xl font-bold">Nothing here yet</p>
          <p>Add a series or change your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {visible.map((s, i) => (
            <Card
              key={s.id}
              s={s}
              fr={friendHas(s)}
              onOpen={setOpen}
              drag={
                canDrag
                  ? {
                      onDragStart: () => (dragIdx.current = i),
                      onDragOver: (e) => e.preventDefault(),
                      onDrop: () => drop(i)
                    }
                  : null
              }
            />
          ))}
        </div>
      )}
      {open && (
        <Drawer
          item={open}
          chars0={open.id ? mychars.filter((c) => c.series_id === open.id) : []}
          thoughts={thoughts(open)}
          fr={open.id ? friendHas(open) : []}
          onClose={() => setOpen(null)}
          onSave={save}
          onDelete={del}
          onShare={(s) => link(s.id)}
          onRecommend={(s) => setRecFor(s)}
        />
      )}
      {recFor && (
        <RecModal
          series={recFor}
          friends={friendList}
          onSend={sendRec}
          onClose={() => setRecFor(null)}
        />
      )}
      {pp && (
        <ProfilePanel
          user={user}
          prof={prof}
          items={items}
          onSave={saveProf}
          onClose={() => setPP(false)}
        />
      )}
      {fpanel && (
        <FriendsPanel
          me={user.id}
          rows={frs}
          prof={fp}
          onClose={() => setFpanel(false)}
          onAct={fAct}
          onAdd={fAdd}
          onLink={() => link()}
        />
      )}
      {panel && (
        <ThemePanel th={th} dark={dark} setDark={setDark} onClose={() => setPanel(false)} />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-ink text-white px-5 py-2 pop">
          {toast}
        </div>
      )}
    </div>
  );
}
