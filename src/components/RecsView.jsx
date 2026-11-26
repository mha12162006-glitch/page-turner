import { isHttp, same } from "../lib/util";
import Avatar from "./Avatar";
import { FriendLine } from "./Card";

export default function RecsView({ recs, fp, items, onAdd, onDismiss }) {
  if (!recs.length) {
    return (
      <div className="text-center py-24 opacity-70">
        <p className="text-xl font-bold">No recommendations yet</p>
        <p>When a friend recommends a series to you, it shows up here.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {recs.map((r) => {
        const s = r.series;
        if (!s || s.is_hidden) return null;
        const pr = fp[r.from_user] || {};
        const name = pr.display_name || "A friend";
        const have = items.some((i) => same(i, s));
        return (
          <div
            key={r.id}
            className="rounded-2xl bg-white dark:bg-white/5 shadow-sm overflow-hidden flex"
          >
            <div className="w-28 shrink-0 bg-plum/10">
              {isHttp(s.cover_url) && (
                <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="p-3 flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-plum">
                <Avatar url={pr.avatar_url} name={name} size={22} />
                💌 {name} recommends
              </div>
              <h3 className="font-bold leading-tight">{s.title}</h3>
              <p className="text-xs opacity-60">
                {s.format}
                {s.pub_status ? " · " + s.pub_status : ""}
                {/^https?:\/\//i.test(s.read_url || "") && (
                  <>
                    {" · "}
                    <a
                      href={s.read_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-plum underline"
                    >
                      Read ↗
                    </a>
                  </>
                )}
              </p>
              <FriendLine
                showName={false}
                x={{
                  status: s.status,
                  rating: s.rating,
                  review: s.review,
                  note: s.note,
                  priority: s.priority,
                  chapter: s.chapter,
                  total: s.total_chapters
                }}
              />
              <div className="flex gap-2 flex-wrap pt-1">
                {have ? (
                  <span className="text-sm font-bold opacity-70">
                    ✓ On your list
                  </span>
                ) : (
                  <button
                    onClick={() => onAdd(r, name)}
                    className="rounded-full bg-plum text-white text-sm font-bold px-3 py-1"
                  >
                    + Want to Read
                  </button>
                )}
                <button
                  onClick={() => onDismiss(r)}
                  className="rounded-full bg-plum/15 text-sm font-bold px-3 py-1"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
