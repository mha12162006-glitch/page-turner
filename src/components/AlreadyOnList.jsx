import { statusLabel } from "../lib/util";

export default function AlreadyOnList({ items, onOpen, onClose }) {
  const list = (Array.isArray(items) ? items : items ? [items] : []).filter(
    Boolean
  );
  if (!list.length) return null;
  const one = list.length === 1;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="pop w-full max-w-md rounded-3xl bg-paper p-6 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold">
          {one
            ? "Already on your list as " + statusLabel(list[0].status)
            : "Some of these are already on your list"}
        </h3>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {list.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl bg-plum/10 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{s.title}</p>
                <p className="text-xs opacity-60">
                  {one ? "You already have this one." : statusLabel(s.status)}
                </p>
              </div>
              <button
                onClick={() => {
                  onOpen(s);
                  onClose();
                }}
                className="rounded-full bg-plum text-white text-sm font-bold px-4 py-1.5"
              >
                Open
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-plum/15 font-bold py-2"
        >
          Close
        </button>
      </div>
    </div>
  );
}
