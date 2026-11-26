/** Footnotes are private to their owner; friend-facing rows never carry them. */

export const noteText = (row) => String(row?.note ?? "");

const noteMap = (rows = []) =>
  new Map(
    (rows || [])
      .filter((row) => row && row.series_id)
      .map((row) => [row.series_id, row])
  );

/** Attach my own footnote to my series rows, regardless of its legacy flag. */
export function attachOwnNotes(rows = [], notes = []) {
  const map = noteMap(notes);
  return (rows || []).map((row) => ({
    ...row,
    note: noteText(map.get(row.id))
  }));
}

/** Remove footnote fields from rows shown to friends or public visitors. */
export function stripNotes(rows = []) {
  return (rows || []).map(({ note, note_shared, ...row }) => row);
}
