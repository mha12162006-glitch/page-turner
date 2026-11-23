import { useState } from "react";
import Avatar from "./Avatar";

export default function RecModal({ series, friends, onSend, onClose }) {
  const [sent, setSent] = useState([]);
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
        {friends.map((f) => (
          <div key={f.uid} className="flex items-center gap-3">
            <Avatar url={f.avatar} name={f.name} size={36} />
            <span className="font-semibold flex-1 truncate">{f.name}</span>
            {sent.includes(f.uid) ? (
              <span className="text-sm font-bold text-plum">✓ Sent</span>
            ) : (
              <button
                onClick={async () => {
                  if (await onSend(f.uid)) setSent((x) => [...x, f.uid]);
                }}
                className="rounded-full bg-plum text-white text-sm font-bold px-4 py-1.5"
              >
                Send
              </button>
            )}
          </div>
        ))}
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
