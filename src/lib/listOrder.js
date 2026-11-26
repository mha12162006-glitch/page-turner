const KEY = "mt-list-order-v1";

export const ORDER = { RECENT: "recent", CUSTOM: "custom" };

export function readOrder() {
  try {
    return window.localStorage.getItem(KEY) === ORDER.CUSTOM
      ? ORDER.CUSTOM
      : ORDER.RECENT;
  } catch (err) {
    return ORDER.RECENT;
  }
}

export function writeOrder(mode) {
  try {
    window.localStorage.setItem(KEY, mode === ORDER.CUSTOM ? ORDER.CUSTOM : ORDER.RECENT);
  } catch (err) {
    // Storage can be unavailable in private browsing; ordering still works in memory.
  }
}

const time = (row) => {
  const value = row?.created_at;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const pos = (row) => Number(row?.position ?? 0);

/** Recently added puts the newest created_at first; custom order uses position. */
export function sortItems(items, mode) {
  const rows = [...(items || [])];
  if (mode === ORDER.CUSTOM) {
    return rows.sort((a, b) => pos(a) - pos(b) || time(b) - time(a));
  }
  return rows.sort((a, b) => time(b) - time(a) || pos(a) - pos(b));
}

/** Reassign positions from the given visible order so a manual arrangement sticks. */
export function positionsFor(list) {
  return list.map((row, index) => ({ id: row.id, position: index }));
}
