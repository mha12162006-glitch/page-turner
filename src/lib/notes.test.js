import { describe, expect, it } from "vitest";
import { attachOwnNotes, attachSharedNotes, noteShared } from "./notes";

const series = (over = {}) => ({
  id: "series-1",
  title: "One",
  ...over
});

describe("footnote visibility", () => {
  it("defaults a missing footnote row to empty and friends-visible", () => {
    const [row] = attachOwnNotes([series()], []);
    expect(row.note).toBe("");
    expect(row.note_shared).toBe(true);
  });

  it("keeps my private footnote on my own rows", () => {
    const [row] = attachOwnNotes(
      [series()],
      [{ series_id: "series-1", note: "Only me", is_shared: false }]
    );
    expect(row.note).toBe("Only me");
    expect(row.note_shared).toBe(false);
  });

  it("attaches only shared, non-empty footnotes to friend rows", () => {
    const rows = attachSharedNotes(
      [series(), series({ id: "series-2" }), series({ id: "series-3" })],
      [
        { series_id: "series-1", note: "Shared", is_shared: true },
        { series_id: "series-2", note: "Private", is_shared: false },
        { series_id: "series-3", note: "   ", is_shared: true }
      ]
    );
    expect(rows[0].note).toBe("Shared");
    expect(rows[1].note).toBe("");
    expect(rows[2].note).toBe("");
  });

  it("treats only an explicit false as private", () => {
    expect(noteShared(undefined)).toBe(true);
    expect(noteShared({ is_shared: true })).toBe(true);
    expect(noteShared({ is_shared: false })).toBe(false);
  });
});
