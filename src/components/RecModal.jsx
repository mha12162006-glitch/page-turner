import { useState } from "react";
import Avatar from "./Avatar";

export default function RecModal({
  series,
  friends,
  sent = [],
  onSend,
  onWithdraw,
  onClose
}) {
  const [justSent, setJustSent] = useState([]);
  const sentTo = (uid) =>
    sent.some((r) => r.uid === uid || r.to_user === uid) ||
    justSent.includes(uid);
  const withdraw = async (friend, row) => {
    if (onWithdraw) {
      const ids = row ? [row.id] : sent.filter((r) => r.uid === friend.uid || r.to_user === friend.uid).map((r) => r.id);
      await onWithdraw(ids);
    }
    setJustSent((list) => list.filter((uid) => uid !== friend.uid));
  };
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="pop w-full max-w-sm rounded-3xl bg-paper p-6 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold">Recommend “{series.title}”</h3>
        {friends.length === 0 && (
          <p className="text-sm opacity-70">
            Add some friends first, then you can send recommendations.
          </p>
        )}
        {friends.map((f) => {
          const row = sent.find(
            (r) => r.uid === f.uid || r.to_user === f.uid
          );
          const isSent = sentTo(f.uid);
          return (
            <div key={f.uid} className="flex items-center gap-3">
              <Avatar url={f.avatar} name={f.name} size={36} />
              <span className="font-semibold flex-1 truncate">{f.name}</span>
              {isSent ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-plum">✓ Sent</span>
                  <button
                    type="button"
                    aria-label={"Withdraw recommendation to " + f.name}
                    title="Withdraw recommendation"
                    onClick={() => withdraw(f, row)}
                    className="grid h-6 w-6 place-items-center rounded-full bg-plum/15 text-sm font-bold text-plum hover:bg-plum/25"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    if (await onSend(f.uid)) setJustSent((x) => [...x, f.uid]);
                  }}
                  className="rounded-full bg-plum text-white text-sm font-bold px-4 py-1.5"
                >
                  Send
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-plum/15 font-bold py-2"
        >
          Done
        </button>
      </div>
    </div>
  );
}
