export const PRESETS = {
  Lavender: ["#7B5CF0", "#F3F1F7", "#14121F"],
  Sakura: ["#EC4899", "#FDF1F5", "#1F121A"],
  Matcha: ["#22A06B", "#EEF6F0", "#101A15"],
  Ocean: ["#0E87DC", "#EEF5FA", "#0F1823"],
  Peach: ["#F4723C", "#FFF3EA", "#1E1511"]
};

export const rgb = (h) =>
  [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16))
    .join(" ");

export function applyTheme(t, dark) {
  const p = PRESETS[t.preset] || PRESETS.Lavender;
  const a = t.accent || p[0];
  const s = document.documentElement.style;
  s.setProperty("--accent", rgb(a));
  s.setProperty("--bg", dark ? p[2] : p[1]);
  document.body.style.backgroundImage = t.grad
    ? `radial-gradient(circle at 8% 0%,${a}38,transparent 42%),` +
      `radial-gradient(circle at 100% 15%,${a}26,transparent 38%)`
    : "none";
}
