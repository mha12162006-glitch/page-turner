import { useEffect, useState } from "react";
import { same, STAT, statusLabel } from "../lib/util";
import { visibleFriendSeries } from "../lib/search";
import Avatar from "./Avatar";
import Card from "./Card";

const FILTERS = [
  ["all", "All"],
  ["reading", "Reading"],
  ["want", "Want to Read"],
  ["hiatus", "Hiatus"],
  ["dropped", "Dropped"],
  ["done", "Completed"]
];

export default function FriendsView({
  friends = [],
  series = [],
  profiles = {},
  mine = [],
  onOpenFriend,
  onAdd,
  onManage
}) {
  const [uid, setUid] = useState(friends[0]?.uid || "");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!friends.some((friend) => friend.uid === uid)) {
      setUid(friends[0]?.uid || "");
      setFilter("all");
    }
  }, [friends, uid]);

  const friend = friends.find((row) => row.uid === uid);
  const visible = visibleFriendSeries(series);
  const rows = visible.filter((row) => row.user_id === uid);
  const counts = {
    all: rows.length,
    reading: rows.filter((row) => row.status === "reading").length,
    want: rows.filter((row) => row.status === "want").length,
    hiatus: rows.filter((row) => row.status === "hiatus").length,
    dropped: rows.filter((row) => row.status === "dropped").length,
    done: rows.filter((row) => row.status === "done").length
  };
  const shown =
    filter === "all" ? rows : rows.filter((row) => row.status === filter);

  const whoElse = (target) => {
    const out = [];
    const own = (mine || []).find((row) => same(row, target));
    if (own) {
      out.push({
        name: "You",
        isMe: true,
        status: own.status,
        rating: own.rating,
        review: own.review,
        note: own.note,
        priority: own.priority,
        chapter: own.chapter,
        total: own.total_chapters
      });
    }
    for (const row of visible) {
      if (row.user_id === uid || !same(row, target)) continue;
      out.push({
        name: profiles[row.user_id]?.display_name || "A friend",
        isMe: false,
        avatar: profiles[row.user_id]?.avatar_url,
        status: row.status,
        rating: row.rating,
        review: row.review,
        note: row.note,
        priority: row.priority,
        chapter: row.chapter,
        total: row.total_chapters
      });
    }
    return out;
  };

  if (!friends.length) {
    return (
      <div className="rounded-2xl bg-white/70 dark:bg-white/5 p-10 text-center space-y-3">
        <p className="text-xl font-extrabold">No friends yet</p>
        <p className="opacity-70">
          Add a friend first, then their reading list appears here with live
          status filters.
        </p>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="rounded-full bg-plum text-white font-bold px-5 py-2"
          >
            Manage friends
          </button>
        )}
      </div>
    );
  }

  const profile = profiles[uid] || {};

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/70 dark:bg-white/5 p-4 space-y-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold opacity-70">Pick a friend</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {friends.map((row) => (
              <button
                key={row.uid}
                type="button"
                aria-pressed={row.uid === uid}
                aria-label={"View " + row.name + "’s list"}
                onClick={() => {
                  setUid(row.uid);
                  setFilter("all");
                }}
                className={
                  "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold " +
                  (row.uid === uid
                    ? "bg-ink text-white dark:bg-white dark:text-ink"
                    : "bg-plum/10")
                }
              >
                <Avatar url={row.avatar} name={row.name} size={24} />
                {row.name}
              </button>
            ))}
          </div>
        </div>

        {friend && (
          <div className="flex items-center gap-3">
            <Avatar url={profile.avatar_url || friend.avatar} name={friend.name} size={56} />
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold">{friend.name}</h2>
              {profile.bio && (
                <p className="text-sm opacity-70 break-words">{profile.bio}</p>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-semibold opacity-70">Filter their list</p>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-2">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                aria-label={label + " (" + counts[key] + ")"}
                onClick={() => setFilter(key)}
                className={
                  "rounded-xl px-2 py-2 text-center font-bold transition " +
                  (filter === key
                    ? "bg-ink text-white dark:bg-white dark:text-ink"
                    : "bg-plum/10")
                }
              >
                <span className="block text-lg leading-none">{counts[key]}</span>
                <span className="mt-1 block text-[11px] leading-tight opacity-80">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white/70 dark:bg-white/5 p-10 text-center opacity-70">
          <p className="text-lg font-bold">
            {filter === "all"
              ? "Nothing to show yet"
              : "Nothing in " + statusLabel(filter)}
          </p>
          <p>
            {filter === "all"
              ? "When this friend adds a series, it will show up here."
              : "Try another status filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {shown.map((row) => (
            <Card
              key={row.id}
              s={row}
              readOnly
              showNote
              fr={whoElse(row)}
              onAdd={onAdd ? (target) => onAdd(target, friend) : undefined}
              onOpen={(target) => onOpenFriend?.(target, friend)}
            />
          ))}
        </div>
      )}

      {friend && (
        <p className="text-xs opacity-60">
          Showing {STAT[filter] || "all"} statuses from {friend.name}’s live
          list. Old statuses are replaced, not stacked.
        </p>
      )}
    </div>
  );
}
