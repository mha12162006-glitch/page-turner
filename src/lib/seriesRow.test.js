import { describe, expect, it, vi } from "vitest";
import {
  anilistIdOrNull,
  reviewSaveErrorMessage,
  reviewUpdatePayload,
  saveErrorMessage,
  seriesWritePayload,
  SERIES_WRITE_FIELDS
} from "./seriesRow";

describe("series write payload", () => {
  it("sends valid defaults for a WEBTOON pick with no AniList id", () => {
    const row = seriesWritePayload(
      {
        title: "Don't Enter the House Pool",
        format: "Webtoon",
        anilist_id: null,
        chapter: 0,
        genres: ["Horror"],
        tags: [],
        warnings: "",
        _source_id: "7580",
        _ageRating: "",
        year: 2026
      },
      "11111111-1111-1111-1111-111111111111",
      { position: 4 }
    );

    expect(row.user_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(row.anilist_id).toBe(null);
    expect(row.chapter).toBe(0);
    expect(row.status).toBe("want");
    expect(row.format).toBe("Webtoon");
    expect(row.title).toBe("Don't Enter the House Pool");
    expect(row.genres).toEqual(["Horror"]);
    expect(row).not.toHaveProperty("_source_id");
    expect(row).not.toHaveProperty("year");
    expect(Object.keys(row).every((key) => SERIES_WRITE_FIELDS.includes(key))).toBe(true);
  });

  it("normalizes bad ids and numeric fields instead of sending them raw", () => {
    expect(anilistIdOrNull("")).toBe(null);
    expect(anilistIdOrNull("0")).toBe(null);
    expect(anilistIdOrNull(0)).toBe(null);
    expect(anilistIdOrNull("42")).toBe(42);

    const row = seriesWritePayload(
      {
        title: "City of Light",
        format: "Unknown format",
        status: "not-a-status",
        anilist_id: "",
        chapter: "",
        total_chapters: "0",
        excitement: 99,
        rating: 12
      },
      "u1"
    );
    expect(row.format).toBe("Manhwa");
    expect(row.status).toBe("want");
    expect(row.anilist_id).toBe(null);
    expect(row.chapter).toBe(0);
    expect(row.total_chapters).toBe(null);
    expect(row.excitement).toBe(5);
    expect(row.rating).toBe(null);
  });

  it("writes only the review column when a review is auto-saved", () => {
    expect(reviewUpdatePayload("  Great story  ")).toEqual({
      review: "Great story"
    });
    expect(reviewUpdatePayload("   ")).toEqual({ review: null });
    expect(Object.keys(reviewUpdatePayload("x"))).toEqual(["review"]);
  });

  it("shows the exact Supabase message for a rejected review write", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { message: "check constraint review_length" };
    expect(reviewSaveErrorMessage(error)).toBe(
      "Review save error: check constraint review_length"
    );
    expect(errorSpy).toHaveBeenCalledWith(error);
    errorSpy.mockRestore();
  });

  it("logs the database error and includes its message in the toast", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = saveErrorMessage({ message: "permission denied for table series" });
    expect(errorSpy).toHaveBeenCalledWith({ message: "permission denied for table series" });
    expect(message).toBe(
      "Could not add this series, please try again: permission denied for table series"
    );
    errorSpy.mockRestore();
  });
});
