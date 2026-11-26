import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetCustom, rememberCustom, resolveCustom } from "./customPresets";

const store = new Map();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value)
    }
  });
});

describe("custom chip presets", () => {
  it("keeps a custom warning for future series", () => {
    rememberCustom("warnings", "Found family");
    expect(resolveCustom("warnings", ["Violence"], [])).toEqual([
      "Found family"
    ]);
    expect([...store.keys()]).toEqual(["mt-custom-presets-v2"]);
  });

  it("never scrapes comma-split sentences from existing series", () => {
    const seriesValues = [
      "No explicit or implied sexual violence (100% safe/PG-13; very clean), poisoning/assassination attempts",
      ["Heterosexual", "Full Color", "Royal Affairs"],
      "Trash MLs, Historical Romance, Long Strip"
    ];
    expect(resolveCustom("warnings", ["Violence"], [seriesValues[0]])).toEqual([]);
    expect(resolveCustom("genres", ["Action"], [seriesValues[1]])).toEqual([]);
    expect(resolveCustom("tags", ["Isekai"], [seriesValues[2]])).toEqual([]);
  });

  it("ignores the stale v1 cache entirely", () => {
    store.set(
      "mt-custom-presets-v1",
      JSON.stringify({ tags: { added: ["Trash MLs"], removed: [] } })
    );
    expect(resolveCustom("tags", ["Isekai"])).toEqual([]);
  });

  it("never returns a built-in or a deleted custom chip", () => {
    rememberCustom("tags", "Slow burn");
    forgetCustom("tags", "Slow burn");
    expect(resolveCustom("tags", ["Isekai"], [["Isekai", "Slow burn"]])).toEqual(
      []
    );
  });

  it("brings a deleted chip back when it is added again", () => {
    rememberCustom("warnings", "Grief");
    forgetCustom("warnings", "Grief");
    rememberCustom("warnings", "Grief");
    expect(resolveCustom("warnings", [], [])).toEqual(["Grief"]);
  });
});
