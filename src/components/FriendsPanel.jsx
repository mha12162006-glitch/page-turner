import { useState } from "react";
import useOverlay from "../lib/useOverlay";
import Avatar from "./Avatar";

export default function FriendsPanel({
  me,
  rows,
  prof,
  onClose,
  onAct,
  onAdd,
  onLink
}) {
  const [txt, setTxt] = useState("");
  const panelRef = useOverlay(onClose, "Friends");
  const other = (r) => (r.requester === me ? r.addressee : r.requester);
  const nm = (r) => prof[other(r)]?.display_name || "Someone";
  const inc = rows.filter((r) => r.status === "pending" && r.addressee === me);
  const out = rows.filter((r) => r.status === "pending" && r.requester === me);
  const fr = rows.filter((r) => r.status === "accepted");
  const Row = ({ r, children }) => (
    <div className="flex items-center gap-3">
      <Avatar url={prof[other(r)]?.avatar_url} name={nm(r)} size={40} />
      <a
        href={"#/share/" + other(r)}
        className="font-bold flex-1 truncate hover:underline"
      >
        {nm(r)}
      </a>
      {children}
    </div>
  );
  const B = ({ onClick, children, cls }) => (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-sm font-bold " + (cls || "bg-plum/15")
      }
    >
      {children}
    </button>
  );
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Friends"
        className="drawer w-full max-w-sm h-full bg-paper p-6 space-y-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold">Friends</h2>
          <button onClick={onClose} className="text-2xl px-2" aria-label="Close">
            ×
          </button>
        </div>
        {inc.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold">Friend requests</p>
            {inc.map((r) => (
              <Row key={r.id} r={r}>
                <B onClick={() => onAct("accept", r)} cls="bg-plum text-white">
                  Accept
                </B>
                <B onClick={() => onAct("remove", r)}>Decline</B>
              </Row>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className="font-semibold">My friends ({fr.length})</p>
          {fr.length === 0 && (
            <p className="text-sm opacity-60">
              No friends yet. Send your link, or paste theirs below.
            </p>
          )}
          {fr.map((r) => (
            <Row key={r.id} r={r}>
              <B
                onClick={() => confirm("Remove this friend?") && onAct("remove", r)}
              >
                Remove
              </B>
            </Row>
          ))}
        </div>
        {out.length > 0 && (
          <div className="space-y-2">
            <p className="font-semibold">Sent requests</p>
            {out.map((r) => (
              <Row key={r.id} r={r}>
                <B onClick={() => onAct("remove", r)}>Cancel</B>
              </Row>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <p className="font-semibold">Add a friend</p>
          <input
            className="inp"
            placeholder="Paste their share link"
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
          />
          <button
            onClick={() => {
              onAdd(txt);
              setTxt("");
            }}
            className="w-full rounded-xl bg-plum text-white font-bold py-2"
          >
            Send friend request
          </button>
          <button
            onClick={onLink}
            className="w-full rounded-xl bg-plum/15 font-bold py-2"
          >
            Copy my link to send to friends
          </button>
        </div>
      </div>
    </div>
  );
}
