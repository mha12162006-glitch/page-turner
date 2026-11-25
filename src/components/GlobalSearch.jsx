import { STAT } from "../lib/util";
import Avatar from "./Avatar";

const SCOPES = [
  ["mine", "Mine"],
  ["friends", "Friends"],
  ["all", "All"]
];

const chapterText = (owner) => {
  if (owner.chapter == null) return "";
  if (!["reading", "hiatus", "dropped", "done"].includes(owner.status)) {
    return "";
  }
  return "Ch. " + owner.chapter + (owner.total ? "/" + owner.total : "");
};

export default function GlobalSearch({
  q,
  setQ,
  scope,
  setScope,
  pending,
  results,
  hasFriends,
  onOpenMine,
  onOpenFriend
}) {
  const typed = q.trim().length > 0;
  const emptyText =
    scope === "mine"
      ? "No matches in your list. Try a title, genre or trope."
      : scope === "friends"
        ? hasFriends
          ? "No matches in your friends’ lists. Hidden series never appear here."
          : "You have no friends yet, so there is nothing to search here."
        : "No matches in your list or your friends’ lists. Try a title, genre or trope.";

  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/5 p-3 sm:p-4 space-y-3 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          className="inp flex-1"
          type="search"
          placeholder="Search titles, genres and tags"
          aria-label="Search all lists"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div
          className="flex gap-1 rounded-full bg-plum/10 p-1 self-start sm:self-auto"
          role="group"
          aria-label="Search in"
        >
          {SCOPES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={scope === key}
              onClick={() => setScope(key)}
              className={
                "rounded-full px-3 py-1.5 text-sm font-bold transition " +
                (scope === key ? "bg-ink text-white dark:bg-white dark:text-ink" : "")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!typed && (
        <p className="text-xs opacity-60">
          Search your list and your accepted friends’ lists. Status tabs are
          ignored while you search.
        </p>
      )}
      {typed && pending && <p className="text-sm opacity-60">Searching…</p>}
      {typed && !pending && results.length === 0 && (
        <div className="rounded-xl bg-plum/10 p-4 text-center">
          <p className="font-bold">No results</p>
          <p className="text-sm opacity-70">{emptyText}</p>
        </div>
      )}
      {typed && !pending && results.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {results.map((group) => (
            <div
              key={group.key}
              data-search-result={group.title}
              className="flex gap-3 rounded-xl bg-plum/10 p-3"
            >
              <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-plum/15">
                {group.cover_url ? (
                  <img
                    src={group.cover_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-[10px] font-bold opacity-50">
                    {group.format}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight">{group.title}</p>
                <p className="text-xs opacity-60">{group.format}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.owners.map((owner) => {
                    const bits = [STAT[owner.status] || "On a list"];
                    const chapter = chapterText(owner);
                    if (chapter) bits.push(chapter);
                    if (owner.rating != null) bits.push(owner.rating + "/10");
                    return (
                      <button
                        key={owner.uid}
                        type="button"
                        data-owner={owner.uid}
                        onClick={() =>
                          owner.isMe
                            ? onOpenMine?.(owner.series)
                            : onOpenFriend?.(owner)
                        }
                        className="flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-1 text-left text-xs font-semibold dark:bg-white/10"
                        title={
                          owner.isMe
                            ? "Open on your list"
                            : "Open their read-only details"
                        }
                      >
                        {owner.isMe ? (
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-plum text-[10px] font-bold text-white">
                            You
                          </span>
                        ) : (
                          <Avatar
                            url={owner.avatar}
                            name={owner.name}
                            size={20}
                          />
                        )}
                        <span className="font-bold">
                          {owner.isMe ? "You" : owner.name}
                        </span>
                        <span className="opacity-70">· {bits.join(" · ")}</span>
                        {owner.isMe && owner.is_hidden && (
                          <span aria-label="Hidden from friends" title="Hidden from friends">
                            🔒
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
