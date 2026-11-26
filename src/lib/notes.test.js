import { describe, expect, it } from "vitest";
import { attachOwnNotes, privateNoteRow, stripNotes } from "./notes";

const series = (over = {}) => ({
  id: "series-1",
  title: "One",
  ...over
});

describe("private footnotes", () => {
  it("defaults a missing footnote row to empty", () => {
    const [row] = attachOwnNotes([series()], []);
    expect(row.note).toBe("");
  });

  it("keeps my footnote on my own rows regardless of the legacy flag", () => {
    const [row] = attachOwnNotes(
      [series()],
      [{ series_id: "series-1", note: "Only me", is_shared: true }]
    );
    expect(row.note).toBe("Only me");
    expect(row.note_shared).toBeUndefined();
  });

  it("removes footnote text from friend-facing rows", () => {
    const [row] = stripNotes([series({ note: "Secret", note_shared: true })]);
    expect(row.note).toBeUndefined();
    expect(row.note_shared).toBeUndefined();
    expect(row.title).toBe("One");
  });

  it("keeps other series fields intact when stripping notes", () => {
    const [row] = stripNotes([
      series({ note: "", review: "A review", is_hidden: false })
    ]);
    expect(row.review).toBe("A review");
    expect(row.is_hidden).toBe(false);
  });

  it("always builds a private, owner-scoped note row", () => {
    expect(privateNoteRow("user-1", "series-1", "Hello")).toEqual({
      series_id: "series-1",
      user_id: "user-1",
      note: "Hello",
      is_shared: false
    });
    expect(privateNoteRow("user-1", "series-1", null).note).toBe("");
  });
});
