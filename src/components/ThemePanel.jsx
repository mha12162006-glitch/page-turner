import useOverlay from "../lib/useOverlay";
import { PRESETS } from "../lib/theme";

export default function ThemePanel({ th, dark, setDark, onClose }) {
  const { t, setT } = th;
  const panelRef = useOverlay(onClose, "Make it yours");
  const acc = t.accent || PRESETS[t.preset][0];
  const Row = ({ label, children }) => (
    <label className="flex items-center justify-between font-semibold">
      {label}
      {children}
    </label>
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
        aria-label="Make it yours"
        className="drawer w-full max-w-sm h-full bg-paper p-6 space-y-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold">Make it yours</h2>
          <button onClick={onClose} className="text-2xl px-2" aria-label="Close">
            ×
          </button>
        </div>
        <div>
          <p className="font-semibold mb-2">Theme</p>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(PRESETS).map(([n, p]) => (
              <button
                key={n}
                onClick={() => setT({ ...t, preset: n, accent: null })}
                className={
                  "rounded-2xl p-1 text-xs font-bold " +
                  (t.preset === n && !t.accent ? "ring-2 ring-plum" : "")
                }
              >
                <span
                  className="block h-10 rounded-xl mb-1"
                  style={{
                    background: `linear-gradient(135deg,${p[0]},${p[1]})`
                  }}
                />
                {n}
              </button>
            ))}
          </div>
        </div>
        <Row label="Custom accent color">
          <input
            type="color"
            value={acc}
            onChange={(e) => setT({ ...t, accent: e.target.value })}
            className="h-10 w-16 rounded-lg bg-transparent cursor-pointer"
          />
        </Row>
        <Row label="Soft color glow background">
          <input
            type="checkbox"
            checked={!!t.grad}
            onChange={(e) => setT({ ...t, grad: e.target.checked })}
            className="h-5 w-5 accent-plum"
          />
        </Row>
        <Row label="Dark mode">
          <input
            type="checkbox"
            checked={dark}
            onChange={() => setDark(!dark)}
            className="h-5 w-5 accent-plum"
          />
        </Row>
        <button
          onClick={() => setT({ preset: "Lavender", grad: true })}
          className="text-sm underline opacity-70"
        >
          Reset to default look
        </button>
      </div>
    </div>
  );
}
