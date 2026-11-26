/** Footnote helpers. A missing row means an empty, friends-visible footnote. */

export const noteText = (row) => String(row?.note ?? "");

export const noteShared = (row) => row?.is_shared !== false;

const noteMap = (rows = []) =>
  new Map(
    (rows || [])
      .filter((row) => row && row.series_id)
      .map((row) => [row.series_id, row])
  );

/** Attach my own footnote, including a private one, to my series rows. */
export function attachOwnNotes(rows = [], notes = []) {
  const map = noteMap(notes);
  return (rows || []).map((row) => {
    const note = map.get(row.id);
    return {
      ...row,
      note: noteText(note),
      note_shared: noteShared(note)
    };
  });
}

/** Attach only shared, non-empty footnotes to friend series rows. */
export function attachSharedNotes(rows = [], notes = []) {
  const map = new Map(
    (notes || [])
      .filter(
        (row) =>
          row &&
          row.series_id &&
          row.is_shared !== false &&
          noteText(row).trim()
      )
      .map((row) => [row.series_id, row])
  );
  return (rows || []).map((row) => ({
    ...row,
    note: noteText(map.get(row.id))
  }));
}
