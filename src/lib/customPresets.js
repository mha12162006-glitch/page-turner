const KEY = "mt-custom-presets-v2";
const KINDS = ["warnings", "genres", "tags"];

const keyOf = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const blank = () => ({
  warnings: { added: [], removed: [] },
  genres: { added: [], removed: [] },
  tags: { added: [], removed: [] }
});

const unique = (list) => {
  const seen = new Set();
  return (list || []).filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function read() {
  const out = blank();
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    for (const kind of KINDS) {
      const bucket = raw?.[kind] || {};
      out[kind].added = unique(Array.isArray(bucket.added) ? bucket.added : []);
      out[kind].removed = unique(
        Array.isArray(bucket.removed) ? bucket.removed : []
      );
    }
  } catch (err) {
    // A blocked or corrupt localStorage must not break the editor.
  }
  return out;
}

function write(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    // Private browsing can block storage; the current session still works.
  }
}

const valid = (kind, label) => KINDS.includes(kind) && !!String(label || "").trim();

/** Make a custom chip permanent, undoing any earlier removal of the same label. */
export function rememberCustom(kind, label) {
  if (!valid(kind, label)) return false;
  const data = read();
  const key = keyOf(label);
  const clean = String(label).trim();
  data[kind].added = unique([clean, ...data[kind].added]);
  data[kind].removed = data[kind].removed.filter((x) => keyOf(x) !== key);
  write(data);
  return true;
}

/** Hide a custom chip from future editors without touching saved series data. */
export function forgetCustom(kind, label) {
  if (!valid(kind, label)) return false;
  const data = read();
  const clean = String(label).trim();
  data[kind].added = data[kind].added.filter((x) => keyOf(x) !== keyOf(clean));
  data[kind].removed = unique([clean, ...data[kind].removed]);
  write(data);
  return true;
}

/**
 * Only the curated built-ins plus chips the current user explicitly added.
 * Values from existing series are deliberately ignored: comma-splitting old
 * rows used to fill the global preset pool with long, messy phrases.
 */
export function resolveCustom(kind, builtins = []) {
  if (!KINDS.includes(kind)) return [];
  const data = read();
  const builtKeys = new Set((builtins || []).map(keyOf));
  const removedKeys = new Set((data[kind].removed || []).map(keyOf));
  return data[kind].added.filter(
    (label) =>
      !builtKeys.has(keyOf(label)) &&
      !removedKeys.has(keyOf(label))
  );
}
