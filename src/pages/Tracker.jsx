import { useEffect, useMemo, useRef, useState } from "react";
import { enrich, needsEnrichment } from "../lib/anilist";
import {
  addFriend,
  findExistingSeries,
  isUniqueViolation,
  sb,
  SERIES_COLUMNS
} from "../lib/supabase";
import {
  applyF,
  blank,
  emptyF,
  httpUrl,
  malImport,
  norm,
  readMalFile,
  same,
  sameChars,
  STATUS,
  statusLabel,
  TABS
} from "../lib/util";
import {
  friendsWhoHave,
  searchGroups,
  seriesKey,
  visibleFriendSeries
} from "../lib/search";
import { attachOwnNotes, stripNotes } from "../lib/notes";
import { ORDER, positionsFor, readOrder, sortItems, writeOrder } from "../lib/listOrder";
import { resolveCustom } from "../lib/customPresets";
import { GENRE_PRESETS, TROPE_PRESETS } from "../lib/tags";
import { WARNING_PRESETS } from "../lib/warnings";
import AddFromFriend from "../components/AddFromFriend";
import AlreadyOnList from "../components/AlreadyOnList";
import Avatar from "../components/Avatar";
import Card from "../components/Card";
import Drawer from "../components/Drawer";
import Filters from "../components/Filters";
import FriendsPanel from "../components/FriendsPanel";
import FriendsView from "../components/FriendsView";
import GlobalSearch from "../components/GlobalSearch";
import Logo from "../components/Logo";
import ProfilePanel from "../components/ProfilePanel";
import RecModal from "../components/RecModal";
import RecsView from "../components/RecsView";
import ThemePanel from "../components/ThemePanel";

export default function Tracker({ user, dark, setDark, th }) {
  const [items, setItems] = useState([]);
  const [orderMode, setOrderMode] = useState(readOrder);
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
  const [sentRecs, setSentRecs] = useState([]);
  const [trecs, setTrecs] = useState([]);
  const [recFor, setRecFor] = useState(null);
  const [mychars, setMychars] = useState([]);
  const [fc, setFc] = useState([]);
  const [dupe, setDupe] = useState(null);
  const [menu, setMenu] = useState(false);
  const [gq, setGq] = useState("");
  const [gscope, setGscope] = useState("all");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [friendOpen, setFriendOpen] = useState(null);
  const [addFor, setAddFor] = useState(null);
  const dragIdx = useRef(null);
  const fileRef = useRef();
  const toastTimer = useRef();
  const customOptions = useMemo(
    () => ({
      warnings: resolveCustom(
        "warnings",
        WARNING_PRESETS,
        items.map((x) => x.warnings)
      ),
      genres: resolveCustom(
        "genres",
        GENRE_PRESETS,
        items.map((x) => x.genres)
      ),
      tags: resolveCustom("tags", TROPE_PRESETS, items.map((x) => x.tags))
    }),
    [items]
  );
  const load = async () => {
    const [seriesResult, charsResult, notesResult] = await Promise.all([
      sb
        .from("series")
        .select(SERIES_COLUMNS)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      sb
        .from("series_characters")
        .select("*")
        .eq("user_id", user.id)
        .order("position"),
      sb
        .from("series_notes")
        .select("series_id,user_id,note")
        .eq("user_id", user.id)
    ]);
    setItems(attachOwnNotes(seriesResult.data || [], notesResult.data || []));
    setMychars(charsResult.data || []);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "series_notes",
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
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(gq.trim()), 250);
    return () => clearTimeout(timer);
  }, [gq]);
  useEffect(() => {
    if (!items.length) return;
    let id = "";
    try {
      id = sessionStorage.getItem("mt-open-series") || "";
    } catch (err) {
      return;
    }
    if (!id) return;
    const row = items.find((x) => x.id === id);
    try {
      sessionStorage.removeItem("mt-open-series");
    } catch (err) {}
    if (row) setOpen(row);
  }, [items]);
  const save = async (s, chs0 = []) => {
    const {
      id,
      created_at,
      user_id,
      notes: _legacyNotes,
      note,
      ...r0
    } = s;
    let rest = r0;
    let chs = chs0;
    if (needsEnrichment(rest)) {
      say("Filling in details…");
      const e = await enrich(rest);
      rest = e.row;
    }
    if (!id) {
      const dup = await findExistingSeries(user.id, rest, items);
      if (dup) {
        setDupe([dup]);
        return;
      }
    }
    const r = id
      ? await sb.from("series").update(rest).eq("id", id).select("id").single()
      : await sb
          .from("series")
          .insert({
            ...rest,
            position: Math.max(-1, ...items.map((i) => i.position)) + 1
          })
          .select("id")
          .single();
    if (r.error) {
      if (!id && isUniqueViolation(r.error)) {
        const dup = await findExistingSeries(user.id, rest, []);
        if (dup) {
          setDupe([dup]);
          return;
        }
      }
      console.error("Saving series failed:", r.error);
      say(
        id
          ? "Could not save those changes. Please try again."
          : "Could not add that series. Please try again."
      );
      return;
    }

    const sid = r.data.id;
    let noteNote = "";
    const { error: noteError } = await sb.from("series_notes").upsert(
      {
        series_id: sid,
        user_id: user.id,
        note: String(note ?? ""),
        is_shared: false
      },
      { onConflict: "series_id" }
    );
    if (noteError) {
      console.error("Saving footnote failed:", noteError);
      noteNote = "Series saved. Footnote could not be updated this time.";
    }
    const origChars = id ? mychars.filter((c) => c.series_id === id) : [];
    let charNote = "";
    if (chs.length > 0 && !sameChars(origChars, chs)) {
      try {
        if (id && origChars.length > 0) {
          const de = await sb
            .from("series_characters")
            .delete()
            .eq("series_id", sid);
          if (de.error) throw de.error;
        }
        const ce = await sb.from("series_characters").insert(
          chs.map((c, k) => ({
            user_id: user.id,
            series_id: sid,
            name: c.name,
            image_url: c.image_url || null,
            comment: c.comment || null,
            position: k
          }))
        );
        if (ce.error) {
          console.error("Saving characters failed:", ce.error);
          charNote = "Series saved. Characters could not be updated this time.";
        }
      } catch (err) {
        console.error("Saving characters failed:", err);
        charNote = "Series saved. Characters could not be updated this time.";
      }
    }
    setOpen(null);
    await load();
    say(charNote || noteNote || (id ? "Saved" : "Added"));
  };
  const saveProf = async (p) => {
    const { error } = await sb.from("profiles").upsert({ user_id: user.id, ...p });
    if (error) {
      console.error("Saving profile failed:", error);
      return say("Could not save your profile. Please try again.");
    }
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
      setFc([]);
      const { data } = await sb
        .from("translator_recs")
        .select(
          "id,series_id,user_id,name,language,type,link,note,created_at,updated_at,series(anilist_id,title,user_id,is_hidden)"
        )
        .eq("user_id", user.id);
      setTrecs(data || []);
      return;
    }
    const [a, b, c, d] = await Promise.all([
      sb.from("profiles").select("*").in("user_id", ids),
      acc.length
        ? sb.from("series").select(SERIES_COLUMNS).in("user_id", acc)
        : { data: [] },
      acc.length
        ? sb.from("series_characters").select("*").in("user_id", acc)
        : { data: [] },
      sb
        .from("translator_recs")
        .select(
          "id,series_id,user_id,name,language,type,link,note,created_at,updated_at,series(anilist_id,title,user_id,is_hidden)"
        )
        .in("user_id", [user.id, ...acc])
    ]);
    const visibleRows = stripNotes(visibleFriendSeries(b.data || []));
    const visibleIds = new Set(visibleRows.map((row) => row.id));
    setFp(Object.fromEntries((a.data || []).map((x) => [x.user_id, x])));
    setFs(visibleRows);
    setFc((c.data || []).filter((row) => visibleIds.has(row.series_id)));
    setTrecs(d.data || []);
  };
  useEffect(() => {
    loadFriends();
    const ch = sb
      .channel("fr-" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, loadFriends)
      .subscribe();
    const seriesCh = sb
      .channel("fr-series-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "series" },
        loadFriends
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "translator_recs" },
        loadFriends
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
      sb.removeChannel(seriesCh);
    };
  }, []);
  const liveFs = useMemo(() => visibleFriendSeries(fs), [fs]);
  const friendHas = (x) => friendsWhoHave(x, liveFs, fp);
  const thoughts = (sr) => (c) => {
    const ids = liveFs.filter((y) => same(sr, y)).map((y) => y.id);
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
  const thoughtsForFriend = (sr, ownerUid) => (c) => {
    const ids = liveFs
      .filter((y) => y.user_id !== ownerUid && same(sr, y))
      .map((y) => y.id);
    const fromFriends = fc
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
    const myIds = items.filter((y) => same(sr, y)).map((y) => y.id);
    const fromMe = mychars
      .filter(
        (x) =>
          myIds.includes(x.series_id) &&
          x.comment &&
          norm(x.name) === norm(c.name)
      )
      .map((x) => ({ name: "You", comment: x.comment }));
    return [...fromFriends, ...fromMe];
  };
  const whoElseHas = (x, excludeUid) => {
    const out = [];
    const own = items.find((row) => same(x, row));
    if (own) {
      out.push({
        name: "You",
        isMe: true,
        status: own.status,
        rating: own.rating,
        review: own.review,
        priority: own.priority,
        chapter: own.chapter,
        total: own.total_chapters
      });
    }
    for (const row of liveFs) {
      if (row.user_id === excludeUid || !same(x, row)) continue;
      out.push({
        name: fp[row.user_id]?.display_name || "A friend",
        isMe: false,
        avatar: fp[row.user_id]?.avatar_url,
        status: row.status,
        rating: row.rating,
        review: row.review,
        priority: row.priority,
        chapter: row.chapter,
        total: row.total_chapters
      });
    }
    return out;
  };
  const loadRecs = async () => {
    const [{ data }, { data: outgoing }] = await Promise.all([
      sb
        .from("recommendations")
        .select("*, series(" + SERIES_COLUMNS + ")")
        .eq("to_user", user.id)
        .order("created_at", { ascending: false }),
      sb
        .from("recommendations")
        .select("id,to_user,series_id,created_at")
        .eq("from_user", user.id)
        .order("created_at", { ascending: false })
    ]);
    setSentRecs(outgoing || []);
    const rows = (data || []).filter((row) => row.series);
    const seen = new Set();
    const next = [];
    for (const row of rows) {
      if (row.series.is_hidden) continue;
      const key = (row.from_user || "") + "|" + seriesKey(row.series);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({ ...row, series: stripNotes([row.series])[0] });
    }
    setRecs(next);
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
  const friendList = (() => {
    const seen = new Set();
    return frs
      .filter((r) => r.status === "accepted")
      .map((r) => {
        const uid = r.requester === user.id ? r.addressee : r.requester;
        return {
          uid,
          name: fp[uid]?.display_name || "Friend",
          avatar: fp[uid]?.avatar_url
        };
      })
      .filter((friend) => {
        if (seen.has(friend.uid)) return false;
        seen.add(friend.uid);
        return true;
      });
  })();
  const sendRec = async (uid) => {
    const { data, error } = await sb
      .from("recommendations")
      .insert({ to_user: uid, series_id: recFor.id })
      .select()
      .single();
    if (error && !isUniqueViolation(error)) {
      console.error("Sending recommendation failed:", error);
      say("Could not send that recommendation. Please try again.");
      return false;
    }
    if (data) {
      setSentRecs((rows) => [
        ...rows.filter(
          (row) => !(row.to_user === uid && row.series_id === recFor.id)
        ),
        data
      ]);
    }
    return true;
  };
  const withdrawSent = async (ids) => {
    const clean = [...new Set((ids || []).filter(Boolean))];
    if (!clean.length) return;
    const before = sentRecs;
    setSentRecs((rows) => rows.filter((row) => !clean.includes(row.id)));
    const { error } = await sb.from("recommendations").delete().in("id", clean);
    if (error) {
      console.error("Withdrawing recommendation failed:", error);
      setSentRecs(before);
      say("Could not withdraw that recommendation. Please try again.");
    }
  };
  const sentFor = (series) =>
    !series?.id
      ? []
      : sentRecs
          .filter((row) => row.series_id === series.id)
          .map((row) => ({
            ...row,
            uid: row.to_user,
            name: fp[row.to_user]?.display_name || "Friend"
          }));
  const translatorRowsFor = (series) => {
    if (!series) return [];
    const seen = new Set();
    return trecs
      .filter((row) => {
        if (!row.series || seen.has(row.id)) return false;
        const match = row.series_id === series.id || same(row.series, series);
        if (match) seen.add(row.id);
        return match;
      })
      .map((row) => ({
        ...row,
        mine: row.user_id === user.id,
        ownerName:
          row.user_id === user.id
            ? "You"
            : fp[row.user_id]?.display_name || "A friend",
        ownerAvatar:
          row.user_id === user.id
            ? prof.avatar_url
            : fp[row.user_id]?.avatar_url
      }));
  };
  const saveTranslator = async (payload) => {
    const name = String(payload.name || "").trim();
    const link = httpUrl(payload.link);
    if (!name) {
      say("Add a translator or group name.");
      return false;
    }
    if (!link) {
      say("Enter an http:// or https:// link.");
      return false;
    }
    if (!["Official license", "Fan translation"].includes(payload.type)) {
      say("Choose Official license or Fan translation.");
      return false;
    }
    const row = {
      series_id: payload.seriesId,
      user_id: user.id,
      name,
      language: String(payload.language || "English").trim() || "English",
      type: payload.type,
      link,
      note: String(payload.note || "").slice(0, 500)
    };
    const { error } = payload.id
      ? await sb
          .from("translator_recs")
          .update(row)
          .eq("id", payload.id)
          .eq("user_id", user.id)
      : await sb.from("translator_recs").insert(row);
    if (error) {
      console.error("Saving translator recommendation failed:", error);
      say(
        isUniqueViolation(error)
          ? "A translator with that name is already listed for this series."
          : "Could not save that translator recommendation. Please try again."
      );
      return false;
    }
    await loadFriends();
    say(
      payload.id
        ? "Translator recommendation updated"
        : "Translator recommendation added"
    );
    return true;
  };
  const deleteTranslator = async (row) => {
    const before = trecs;
    setTrecs((rows) => rows.filter((x) => x.id !== row.id));
    const { error } = await sb
      .from("translator_recs")
      .delete()
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (error) {
      console.error("Deleting translator recommendation failed:", error);
      setTrecs(before);
      say("Could not remove that translator recommendation. Please try again.");
      return;
    }
    say("Translator recommendation removed");
  };
  const addRec = async (r, name) => {
    say("Adding…");
    const x = r.series;
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
      read_url: ""
    };
    const dup = await findExistingSeries(user.id, row, items);
    if (dup) {
      setDupe([dup]);
      return;
    }
    const { data, error } = await sb
      .from("series")
      .insert({
        ...row,
        status: "want",
        source: "Recommended by " + name,
        position: Math.max(-1, ...items.map((i) => i.position)) + 1
      })
      .select("id")
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await findExistingSeries(user.id, row, []);
        if (existing) {
          setDupe([existing]);
          return;
        }
      }
      console.error("Adding recommendation failed:", error);
      say("Could not add that recommendation. Please try again.");
      return;
    }
    const cs = fc.filter((c) => c.series_id === x.id);
    let charNote = "";
    if (cs.length) {
      try {
        const ce = await sb.from("series_characters").insert(
          cs.map((c, k) => ({
            user_id: user.id,
            series_id: data.id,
            name: c.name,
            image_url: c.image_url || null,
            position: k
          }))
        );
        if (ce.error) {
          console.error("Saving characters failed:", ce.error);
          charNote = "Added to Want to Read. Characters could not be updated this time.";
        }
      } catch (err) {
        console.error("Saving characters failed:", err);
        charNote = "Added to Want to Read. Characters could not be updated this time.";
      }
    }
    await load();
    say(charNote || "Added to Want to Read");
  };
  const addFromFriend = async (source, friend, { status, chapter } = {}) => {
    if (!source || !friend) return false;
    const row = {
      title: source.title,
      cover_url: source.cover_url || null,
      format: source.format || "Manhwa",
      genres: [...(source.genres || [])],
      tags: [...(source.tags || [])],
      warnings: source.warnings || "",
      synopsis: source.synopsis || "",
      anilist_id: source.anilist_id ?? null,
      pub_status: source.pub_status || "",
      total_chapters: source.total_chapters ?? null,
      read_url: ""
    };
    const dup = await findExistingSeries(user.id, row, items);
    if (dup) {
      setAddFor(null);
      setFriendOpen(null);
      setDupe([dup]);
      return false;
    }
    const { data, error } = await sb
      .from("series")
      .insert({
        ...row,
        status: status || "want",
        chapter: chapter == null ? null : chapter,
        source: "From " + (friend.name || "a friend") + " list",
        position: Math.max(-1, ...items.map((i) => i.position)) + 1
      })
      .select("id")
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await findExistingSeries(user.id, row, []);
        if (existing) {
          setAddFor(null);
          setFriendOpen(null);
          setDupe([existing]);
          return false;
        }
      }
      console.error("Adding from a friend failed:", error);
      say("Could not add that series. Please try again.");
      return false;
    }
    const sourceIds = liveFs
      .filter((row) => row.user_id === friend.uid && same(row, source))
      .map((row) => row.id);
    const cs = fc.filter((c) => sourceIds.includes(c.series_id));
    let charNote = "";
    if (cs.length) {
      try {
        const ce = await sb.from("series_characters").insert(
          cs.map((c, k) => ({
            user_id: user.id,
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
    await load();
    setAddFor(null);
    setFriendOpen(null);
    say(charNote || "Added to " + statusLabel(status || "want"));
    return true;
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
    if (error) {
      console.error("Updating friend request failed:", error);
      say("Could not update that friend request. Please try again.");
    }
    loadFriends();
  };
  const fAdd = async (txt) => {
    const m = txt.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (!m) return say("That does not look like a share link.");
    const uid = m[0].toLowerCase();
    if (uid === user.id) return say("That is your own link.");
    const { error } = await addFriend(user.id, uid, frs);
    if (error) {
      console.error("Sending friend request failed:", error);
      return say("Could not send that friend request. Please try again.");
    }
    say("Friend request sent");
    loadFriends();
  };
  const link = async (id) => {
    if (!prof.is_public) {
      const ok = confirm(
        "Share links only work when your list is public. If you turn this on, anyone with the link can see your list, even without signing in. Turn it on and copy the link?"
      );
      if (!ok) return;
      const { error } = await sb
        .from("profiles")
        .upsert({ user_id: user.id, is_public: true });
      if (error) {
        console.error("Making profile public failed:", error);
        return say("Could not make your list public. Please try again.");
      }
      setProf((x) => ({ ...x, is_public: true }));
    }
    const url =
      location.href.split("#")[0] + "#/share/" + user.id + (id ? "/" + id : "");
    await navigator.clipboard
      .writeText(url)
      .catch(() => prompt("Copy this link", url));
    say("Link copied");
  };
  const visible = useMemo(
    () =>
      sortItems(
        applyF(
          items.filter((i) =>
            tab === "active" ? i.status !== "done" : i.status === tab
          ),
          f
        ),
        orderMode
      ),
    [items, tab, f, orderMode]
  );
  const chooseOrder = (mode) => {
    setOrderMode(mode);
    writeOrder(mode);
  };
  const searchResults = useMemo(
    () =>
      searchGroups({
        q: debouncedQ,
        scope: gscope,
        mine: items,
        friends: fs,
        profiles: fp
      }),
    [debouncedQ, gscope, items, fs, fp]
  );
  const searchOpen = gq.trim().length > 0;
  const searchPending = gq.trim() !== debouncedQ;
  const friendLive = friendOpen
    ? liveFs.find((row) => row.id === friendOpen.series.id) ||
      liveFs.find(
        (row) =>
          row.user_id === friendOpen.friend.uid &&
          same(row, friendOpen.series)
      )
    : null;
  const canDrag = f === emptyF || JSON.stringify(f) === JSON.stringify(emptyF);
  const commitOrder = async (list) => {
    const pos = positionsFor(list);
    const byId = Object.fromEntries(pos.map((row) => [row.id, row.position]));
    setItems((p) =>
      p.map((x) =>
        byId[x.id] == null ? x : { ...x, position: byId[x.id] }
      )
    );
    chooseOrder(ORDER.CUSTOM);
    await Promise.all(
      pos.map((p) =>
        sb.from("series").update({ position: p.position }).eq("id", p.id)
      )
    );
    load();
  };
  const drop = async (to) => {
    const from = dragIdx.current;
    if (from == null || from === to) return;
    const list = [...visible];
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    await commitOrder(list);
  };
  const move = async (id, direction) => {
    const list = [...visible];
    const from = list.findIndex((row) => row.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    const [row] = list.splice(from, 1);
    list.splice(to, 0, row);
    await commitOrder(list);
  };
  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let xml;
    try {
      xml = await readMalFile(file);
    } catch (err) {
      console.error("Reading the MAL file failed:", err);
      return say(
        "Could not read that file. Try unzipping it first and choosing the .xml file inside."
      );
    }
    const { rows, anime } = malImport(xml, user.id);
    if (!rows.length) {
      return say(
        anime
          ? "That looks like your anime list. Please choose your manga list file instead (it has manga in its name)."
          : "No manga entries found. Make sure you chose the manga list export from MyAnimeList."
      );
    }
    say("Importing…");
    const { data: fresh, error: readError } = await sb
      .from("series")
      .select(SERIES_COLUMNS)
      .eq("user_id", user.id);
    if (readError) console.error("Loading your list before import failed:", readError);
    const have = [...(fresh || items)];
    const skippedItems = [];
    const add = [];
    let skipped = 0;
    let nextPos = Math.max(-1, ...items.map((i) => i.position)) + 1;
    for (const r of rows) {
      const dup = have.find((x) => same(x, r));
      if (dup) {
        skipped++;
        if (dup.id && !skippedItems.some((x) => x.id === dup.id)) {
          skippedItems.push(dup);
        }
        continue;
      }
      const row = { ...r, position: nextPos++ };
      add.push(row);
      have.push(row);
    }

    let imported = 0;
    let failed = 0;
    if (add.length) {
      const { error } = await sb.from("series").insert(add);
      if (!error) {
        imported = add.length;
      } else if (isUniqueViolation(error)) {
        for (const row of add) {
          const dup = await findExistingSeries(user.id, row, []);
          if (dup) {
            skipped++;
            if (!skippedItems.some((x) => x.id === dup.id)) {
              skippedItems.push(dup);
            }
            continue;
          }
          const { error: one } = await sb.from("series").insert(row);
          if (!one) imported++;
          else if (isUniqueViolation(one)) skipped++;
          else {
            failed++;
            console.error("Importing a title failed:", one);
          }
        }
      } else {
        console.error("Importing the MAL list failed:", error);
        return say("Could not import that file. Please try again.");
      }
    }
    await load();
    say(
      "Imported " +
        imported +
        " · Skipped " +
        skipped +
        (skipped ? " already on your list" : "")
    );
    if (skippedItems.length) setDupe(skippedItems);
    else if (!imported && failed) {
      say("Could not import that file. Please try again.");
    }
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
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.gz,application/xml,text/xml,application/gzip"
            hidden
            onChange={onFile}
          />
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
          <div className="relative">
            <button
              onClick={() => setMenu((v) => !v)}
              className="rounded-full bg-plum/15 font-bold px-4 py-2"
              aria-expanded={menu}
              aria-haspopup="menu"
            >
              ⋯ Menu
            </button>
            {menu && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setMenu(false)}
                />
                <div className="absolute right-0 z-40 mt-2 w-60 rounded-2xl bg-white dark:bg-[#221f33] shadow-xl p-2">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      fileRef.current?.click();
                    }}
                    className="w-full text-left rounded-xl px-3 py-2 font-semibold hover:bg-plum/10"
                  >
                    ⬆ Import from MyAnimeList
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setFpanel(true)}
            className="rounded-full bg-plum/15 font-bold px-4 py-2"
          >
            👥 Requests
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
            onClick={() => {
              setTab(k);
              setGq("");
            }}
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
        <button
          onClick={() => {
            setTab("friends");
            setGq("");
          }}
          className={
            "rounded-full px-3 sm:px-5 py-1.5 sm:py-2 text-sm sm:text-base font-bold transition " +
            (tab === "friends"
              ? "bg-ink text-white dark:bg-white dark:text-ink"
              : "bg-plum/10")
          }
        >
          Friends <span className="opacity-60">{friendList.length}</span>
        </button>
      </nav>
      <GlobalSearch
        q={gq}
        setQ={setGq}
        scope={gscope}
        setScope={setGscope}
        pending={searchPending}
        results={searchResults}
        hasFriends={friendList.length > 0}
        onOpenMine={setOpen}
        onOpenFriend={(owner) =>
          setFriendOpen({
            series: owner.series,
            friend: {
              uid: owner.uid,
              name: owner.name,
              avatar: owner.avatar
            }
          })
        }
      />
      {searchOpen ? null : tab === "recs" ? (
        <RecsView
          recs={recs}
          fp={fp}
          items={items}
          onAdd={addRec}
          onDismiss={dismissRec}
        />
      ) : tab === "friends" ? (
        <FriendsView
          friends={friendList}
          series={fs}
          profiles={fp}
          mine={items}
          onOpenFriend={(series, friend) => setFriendOpen({ series, friend })}
          onAdd={(series, friend) => setAddFor({ series, friend })}
          onManage={() => setFpanel(true)}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Filters f={f} setF={setF} items={items} />
            <label className="flex items-center gap-2 text-sm font-semibold">
              <span>Order</span>
              <select
                aria-label="List order"
                value={orderMode}
                onChange={(e) => chooseOrder(e.target.value)}
                className="inp w-auto py-1.5"
              >
                <option value={ORDER.RECENT}>Recently added</option>
                <option value={ORDER.CUSTOM}>Custom order</option>
              </select>
            </label>
          </div>
          {tab !== "done" && canDrag && visible.length > 1 && (
            <p className="text-sm opacity-60 text-center sm:text-left">
              Drag cards or use the ↑ ↓ buttons to set your order. Saving a manual
              order switches to Custom order.
            </p>
          )}
          {visible.length === 0 ? (
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
                  outgoing={sentFor(s)}
                  onWithdraw={withdrawSent}
                  translatorCount={translatorRowsFor(s).length}
                  onMove={
                    canDrag
                      ? (direction) => move(s.id, direction)
                      : null
                  }
                  moveUpDisabled={i === 0}
                  moveDownDisabled={i === visible.length - 1}
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
        </>
      )}
      {open && (
        <Drawer
          key={open.id || "new"}
          item={open}
          chars0={open.id ? mychars.filter((c) => c.series_id === open.id) : []}
          thoughts={thoughts(open)}
          fr={open.id ? friendHas(open) : []}
          onClose={() => setOpen(null)}
          onSave={save}
          onDelete={del}
          onShare={(s) => link(s.id)}
          onRecommend={(s) => setRecFor(s)}
          notify={say}
          custom={customOptions}
          outgoing={sentFor(open)}
          onWithdrawSent={withdrawSent}
          translatorRecs={translatorRowsFor(open)}
          onSaveTranslator={saveTranslator}
          onDeleteTranslator={deleteTranslator}
        />
      )}
      {friendOpen && friendLive && (
        <Drawer
          key={friendLive.id}
          item={friendLive}
          readOnly
          friend={friendOpen.friend}
          friendView
          mine={items}
          fr={whoElseHas(friendLive, friendOpen.friend.uid)}
          chars0={fc.filter((c) =>
            liveFs.some(
              (row) =>
                row.user_id === friendOpen.friend.uid &&
                same(row, friendLive) &&
                row.id === c.series_id
            )
          )}
          thoughts={thoughtsForFriend(friendLive, friendOpen.friend.uid)}
          recommendations={recs.filter(
            (row) =>
              row.from_user === friendOpen.friend.uid &&
              same(row.series, friendLive)
          )}
          translatorRecs={translatorRowsFor(friendLive)}
          onAdd={(series) =>
            setAddFor({ series, friend: friendOpen.friend })
          }
          onOpenMine={(series) => {
            setFriendOpen(null);
            setOpen(series);
          }}
          onClose={() => setFriendOpen(null)}
          notify={say}
        />
      )}
      {addFor && (
        <AddFromFriend
          source={addFor.series}
          mine={items}
          friendName={addFor.friend?.name || "a friend"}
          onAdd={(choice) =>
            addFromFriend(addFor.series, addFor.friend, choice)
          }
          onOpen={(series) => {
            setAddFor(null);
            setFriendOpen(null);
            setOpen(series);
          }}
          onClose={() => setAddFor(null)}
        />
      )}
      {recFor && (
        <RecModal
          series={recFor}
          friends={friendList}
          sent={sentFor(recFor)}
          onSend={sendRec}
          onWithdraw={withdrawSent}
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
      {dupe && (
        <AlreadyOnList
          items={dupe}
          onOpen={(s) => {
            setDupe(null);
            setFriendOpen(null);
            setAddFor(null);
            setOpen(s);
          }}
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
