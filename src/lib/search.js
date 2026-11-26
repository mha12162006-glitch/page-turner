import { norm, same } from "./util";

const asList = (value) =>
  Array.isArray(value) ? value : value == null || value === "" ? [] : [value];

const rowTime = (row) => {
  const value = Date.parse(row?.updated_at || row?.created_at || "");
  return Number.isFinite(value) ? value : 0;
};

/**
 * A stable key for one title. The normalized title wins because the search UI
 * groups by the title people see; AniList id is the fallback for blank titles.
 */
export const seriesKey = (row) => {
  const title = norm(row?.title);
  if (title) return "title:" + title;
  if (row?.anilist_id != null && row.anilist_id !== "") {
    return "anilist:" + row.anilist_id;
  }
  return "row:" + (row?.id || "unknown");
};

/**
 * Keep only one row per person + series. If old duplicate rows exist, the most
 * recently updated row wins, so a friend's current status replaces the stale
 * one instead of being shown beside it.
 */
export function latestPerSeries(rows = []) {
  const latest = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const key = (row.user_id || "") + "|" + seriesKey(row);
    const previous = latest.get(key);
    if (!previous || rowTime(row) >= rowTime(previous)) {
      latest.set(key, row);
    }
  }
  return [...latest.values()];
}

/** Friend rows that are allowed to be shown: never hidden, never duplicated. */
export const visibleFriendSeries = (rows = []) =>
  latestPerSeries((rows || []).filter((row) => row && !row.is_hidden));

/** Search title, genres and tags. Every word in the query must match. */
export function matchesSearch(row, query) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return false;
  const haystack = [
    row?.title,
    ...asList(row?.genres),
    ...asList(row?.tags)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * Group search hits by series and list every person who has that series.
 * `mine` may contain hidden rows (only I can see them). `friends` is filtered
 * to non-hidden rows here as a second line of defence after RLS.
 */
export function searchGroups({
  q = "",
  scope = "all",
  mine = [],
  friends = [],
  profiles = {}
} = {}) {
  const groups = new Map();
  const add = (row, owner) => {
    if (!matchesSearch(row, q)) return;
    const key = seriesKey(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: row.title,
        cover_url: row.cover_url,
        format: row.format,
        anilist_id: row.anilist_id,
        owners: []
      };
      groups.set(key, group);
    }
    if (!group.owners.some((x) => x.uid === owner.uid)) {
      group.owners.push({
        ...owner,
        status: row.status,
        chapter: row.chapter,
        total: row.total_chapters,
        rating: row.rating,
        is_hidden: !!row.is_hidden,
        series: row
      });
    }
  };

  if (scope !== "friends") {
    for (const row of latestPerSeries(mine || [])) {
      add(row, {
        uid: row.user_id || "me",
        name: "You",
        avatar: null,
        isMe: true
      });
    }
  }
  if (scope !== "mine") {
    for (const row of visibleFriendSeries(friends)) {
      add(row, {
        uid: row.user_id,
        name: profiles?.[row.user_id]?.display_name || "A friend",
        avatar: profiles?.[row.user_id]?.avatar_url || null,
        isMe: false
      });
    }
  }

  return [...groups.values()].sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

/** Everyone who has the same series as `target`, with their live status. */
export function friendsWhoHave(target, friendRows = [], profiles = {}) {
  return visibleFriendSeries(friendRows)
    .filter((row) => same(row, target))
    .map((row) => ({
      uid: row.user_id,
      isMe: false,
      name: profiles?.[row.user_id]?.display_name || "A friend",
      avatar: profiles?.[row.user_id]?.avatar_url,
      status: row.status,
      rating: row.rating,
      review: row.review,
      note: row.note,
      priority: row.priority,
      chapter: row.chapter,
      total: row.total_chapters,
      series: row
    }));
}
