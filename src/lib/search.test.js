import { describe, expect, it } from "vitest";
import {
  friendsWhoHave,
  latestPerSeries,
  matchesSearch,
  searchGroups,
  seriesKey,
  visibleFriendSeries
} from "./search";

const ME = "11111111-1111-1111-1111-111111111111";
const FRIEND = "22222222-2222-2222-2222-222222222222";

const row = (over = {}) => ({
  id: over.id || Math.random().toString(36),
  user_id: ME,
  title: "Secret Lady",
  genres: ["Romance"],
  tags: ["Revenge"],
  status: "want",
  chapter: null,
  total_chapters: null,
  rating: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...over
});

describe("search helpers", () => {
  it("groups by normalized title and falls back to the AniList id", () => {
    expect(seriesKey(row({ title: "Secret Lady!" }))).toBe("title:secretlady");
    expect(seriesKey(row({ title: "", anilist_id: 99 }))).toBe("anilist:99");
  });

  it("keeps only the newest row for a friend and series", () => {
    const old = row({
      id: "old",
      user_id: FRIEND,
      status: "want",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    const live = row({
      id: "live",
      user_id: FRIEND,
      status: "reading",
      updated_at: "2026-02-01T00:00:00.000Z"
    });
    expect(latestPerSeries([old, live])).toEqual([live]);
  });

  it("never includes hidden friend rows", () => {
    const hidden = row({ id: "hidden", user_id: FRIEND, is_hidden: true });
    const shown = row({ id: "shown", user_id: FRIEND, is_hidden: false });
    expect(visibleFriendSeries([hidden, shown])).toEqual([shown]);
  });

  it("searches title, genres and tags with every word", () => {
    expect(matchesSearch(row(), "secret")).toBe(true);
    expect(matchesSearch(row(), "romance revenge")).toBe(true);
    expect(matchesSearch(row(), "romance comedy")).toBe(false);
    expect(matchesSearch(row(), "  ")).toBe(false);
  });

  it("groups the same series across me and a friend", () => {
    const mine = row({ id: "mine", status: "done", rating: 9 });
    const friend = row({
      id: "friend",
      user_id: FRIEND,
      status: "reading",
      chapter: 4
    });
    const groups = searchGroups({
      q: "secret",
      scope: "all",
      mine: [mine],
      friends: [friend],
      profiles: { [FRIEND]: { display_name: "Nour" } }
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].owners.map((owner) => owner.name)).toEqual([
      "You",
      "Nour"
    ]);
    expect(groups[0].owners[0].status).toBe("done");
    expect(groups[0].owners[1].chapter).toBe(4);
  });

  it("respects the Mine/Friends scopes and hides hidden friends", () => {
    const mine = row({ id: "mine" });
    const friend = row({ id: "friend", user_id: FRIEND });
    const hidden = row({
      id: "hidden",
      user_id: FRIEND,
      title: "Hidden Secret",
      is_hidden: true
    });
    expect(
      searchGroups({
        q: "secret",
        scope: "mine",
        mine: [mine],
        friends: [friend, hidden]
      })[0].owners
    ).toHaveLength(1);
    expect(
      searchGroups({
        q: "secret",
        scope: "friends",
        mine: [mine],
        friends: [friend, hidden]
      })[0].owners
    ).toHaveLength(1);
    expect(
      searchGroups({
        q: "hidden",
        scope: "all",
        mine: [],
        friends: [hidden]
      })
    ).toEqual([]);
  });

  it("uses my newest row when my own list has a duplicate", () => {
    const old = row({
      id: "mine-old",
      status: "want",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    const live = row({
      id: "mine-live",
      status: "reading",
      chapter: 6,
      updated_at: "2026-02-01T00:00:00.000Z"
    });
    const groups = searchGroups({
      q: "secret",
      scope: "mine",
      mine: [old, live],
      friends: []
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].owners).toHaveLength(1);
    expect(groups[0].owners[0].status).toBe("reading");
    expect(groups[0].owners[0].chapter).toBe(6);
  });

  it("returns live friend statuses only once for the same series", () => {
    const old = row({
      id: "old",
      user_id: FRIEND,
      status: "want",
      created_at: "2026-01-01T00:00:00.000Z"
    });
    const live = row({
      id: "live",
      user_id: FRIEND,
      status: "reading",
      updated_at: "2026-02-01T00:00:00.000Z"
    });
    const found = friendsWhoHave(row(), [old, live], {
      [FRIEND]: { display_name: "Nour" }
    });
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe("reading");
    expect(found[0].name).toBe("Nour");
  });
});
