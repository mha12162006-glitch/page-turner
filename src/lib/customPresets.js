import { splitTags } from "./tags";
import { parseWarnings } from "./warnings";

const KEY = "mt-custom-presets-v1";
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
 * Custom chips from this browser plus custom values already used on the
 * owner's series. Built-ins and explicitly removed chips are never returned.
 */
export function resolveCustom(kind, builtins = [], values = []) {
  if (!KINDS.includes(kind)) return [];
  const data = read();
  const builtKeys = new Set((builtins || []).map(keyOf));
  const removedKeys = new Set((data[kind].removed || []).map(keyOf));
  const out = [];
  const add = (label) => {
    const clean = String(label || "").trim();
    const key = keyOf(clean);
    if (
      !key ||
      builtKeys.has(key) ||
      removedKeys.has(key) ||
      out.some((x) => keyOf(x) === key)
    ) {
      return;
    }
    out.push(clean);
  };

  data[kind].added.forEach(add);
  for (const raw of values || []) {
    const list =
      kind === "warnings"
        ? parseWarnings(raw)
        : Array.isArray(raw)
          ? splitTags(raw)
          : splitTags(raw);
    list.forEach(add);
  }
  return out;
}
