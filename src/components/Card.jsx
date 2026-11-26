import { isHttp, STAT } from "../lib/util";
import Avatar from "./Avatar";
import SpoilerText from "./SpoilerText";
import Stars from "./Stars";

export function FriendLine({ x, showName = true }) {
  const head = [
    showName && x.name,
    STAT[x.status],
    ["reading", "hiatus", "dropped"].includes(x.status) &&
      x.chapter != null &&
      "Ch. " + x.chapter + (x.total ? "/" + x.total : ""),
    x.priority && "★ Top pick",
    ["done", "dropped"].includes(x.status) &&
      x.rating != null &&
      x.rating + "/10"
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="text-xs space-y-0.5 py-1.5">
      <p className="font-bold text-plum">{head}</p>
      {x.review && (
        <details
          className="rounded-lg bg-plum/10 px-2 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <summary className="cursor-pointer font-bold">Review</summary>
          <p className="mt-1 break-words whitespace-pre-line">
            <SpoilerText text={x.review} />
          </p>
        </details>
      )}
    </div>
  );
}

export default function Card({
  s,
  onOpen,
  drag,
  readOnly,
  fr,
  onAdd,
  outgoing = [],
  onWithdraw,
  translatorCount = 0,
  onChapter
}) {
  const mine = (fr || []).find((x) => x.isMe === true);
  return (
    <article
      draggable={!readOnly && !!drag}
      {...(drag || {})}
      onClick={() => onOpen(s)}
      className={
        "group cursor-pointer rounded-2xl overflow-hidden bg-white " +
        "dark:bg-white/5 transition hover:-translate-y-1 " +
        (s.priority
          ? "ring-2 ring-amber-400 " +
            "shadow-[0_8px_30px_rgba(242,179,61,.3)]"
          : "shadow-sm hover:shadow-lg")
      }
    >
      <div className="relative aspect-[2/3] bg-plum/10">
        {isHttp(s.cover_url) ? (
          <img
            src={s.cover_url}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="h-full grid place-items-center p-4 text-center font-bold opacity-60">
            {s.title}
          </div>
        )}
        <span className="absolute top-2 left-2 text-xs font-bold rounded-full px-2 py-0.5 bg-black/60 text-white">
          {s.format}
        </span>
        {s.priority && (
          <span className="absolute top-2 right-2 rounded-full bg-amber-400 text-black text-xs font-bold px-2 py-0.5">
            ★ Top pick
          </span>
        )}
        {!readOnly && s.is_hidden && (
          <span
            className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white"
            aria-label="Hidden from friends"
            title="Hidden from friends"
          >
            🔒 Hidden
          </span>
        )}
        {translatorCount > 0 && (
          <span
            className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white"
            aria-label={
              translatorCount + " translator recommendations"
            }
            title="Translator recommendations"
          >
            🌐 {translatorCount}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-bold leading-tight line-clamp-2">{s.title}</h3>
        {s.pub_status && (
          <p className="text-xs opacity-60">{s.pub_status}</p>
        )}
        {["reading", "hiatus", "dropped"].includes(s.status) &&
          (s.chapter != null || (!readOnly && onChapter)) && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold">
                  Ch. {s.chapter ?? 0}
                  {s.total_chapters ? " / " + s.total_chapters : ""}
                </p>
                {!readOnly && onChapter && (
                  <span
                    className="flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={"Decrease chapter for " + s.title}
                      title="Decrease chapter"
                      disabled={(s.chapter ?? 0) <= 0}
                      onClick={() => onChapter(-1)}
                      className="grid h-5 w-5 place-items-center rounded-md bg-plum/15 text-xs font-bold text-plum hover:bg-plum/25 disabled:opacity-30"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label={"Increase chapter for " + s.title}
                      title="Increase chapter"
                      disabled={
                        s.total_chapters > 0 &&
                        (s.chapter ?? 0) >= s.total_chapters
                      }
                      onClick={() => onChapter(1)}
                      className="grid h-5 w-5 place-items-center rounded-md bg-plum/15 text-xs font-bold text-plum hover:bg-plum/25 disabled:opacity-30"
                    >
                      +
                    </button>
                  </span>
                )}
              </div>
              {s.total_chapters > 0 && (
                <div className="h-1.5 rounded-full bg-plum/15 overflow-hidden">
                  <div
                    className="h-full bg-plum"
                    style={{
                      width:
                        Math.min(
                          100,
                          ((s.chapter ?? 0) / s.total_chapters) * 100
                        ) + "%"
                    }}
                  />
                </div>
              )}
            </div>
          )}
        {/^https?:\/\//i.test(s.read_url || "") && (
          <a
            href={s.read_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-block text-xs font-bold text-plum underline"
          >
            Read ↗
          </a>
        )}
        {mine ? (
          <p className="mt-2 text-xs font-bold text-plum">
            ✓ On your list as {STAT[mine.status] || "on your list"}
          </p>
        ) : onAdd ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAdd(s);
            }}
            className="mt-2 w-full rounded-full bg-plum text-white text-xs font-bold py-1.5"
          >
            + Add to my list
          </button>
        ) : null}
        {outgoing.length > 0 && !readOnly && (
          <div
            className="mt-2 flex items-center gap-1 rounded-full bg-plum/15 px-2 py-1 text-xs font-bold text-plum"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="min-w-0 flex-1 truncate">
              💌 Sent to - {outgoing.map((r) => r.name).join(", ")}
            </span>
            {onWithdraw && (
              <button
                type="button"
                aria-label={"Withdraw recommendations for " + s.title}
                title="Withdraw recommendation"
                onClick={() => onWithdraw(outgoing.map((r) => r.id))}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-plum/20"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center justify-between">
          <Stars v={s.excitement} size="text-sm" />
          {["done", "hiatus", "dropped"].includes(s.status) &&
            s.rating != null && (
              <span className="text-sm font-bold text-plum">
                {s.rating}/10
              </span>
            )}
        </div>
        {fr && fr.length > 0 && (
          <div className="mt-2 divide-y divide-plum/15 border-t border-plum/20">
            {fr.map((x, i) => (
              <FriendLine key={i} x={x} />
            ))}
          </div>
        )}
        {(s.status === "done" || s.status === "dropped") && s.review && (
          readOnly ? (
            <details
              className="mt-2 text-xs rounded-lg bg-plum/10 px-2 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <summary className="cursor-pointer font-bold text-plum">
                Review
              </summary>
              <p className="mt-1 break-words whitespace-pre-line">
                <SpoilerText text={s.review} />
              </p>
            </details>
          ) : (
            <div
              className="mt-2 rounded-lg bg-plum/10 px-2 py-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-bold uppercase tracking-wide text-plum">
                My review
              </p>
              <p className="mt-1 text-xs break-words whitespace-pre-line">
                <SpoilerText text={s.review} />
              </p>
            </div>
          )
        )}
        {!readOnly && s.note && (
          <div
            className="mt-2 rounded-lg border-l-2 border-plum/40 bg-plum/5 px-2 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-60">
              My footnote
            </p>
            <p className="mt-0.5 text-xs italic break-words whitespace-pre-line">
              {s.note}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
