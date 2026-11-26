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
  });

  it("gathers custom values already used on existing series", () => {
    expect(
      resolveCustom("genres", ["Action"], [["Action", "Time Travel"]])
    ).toEqual(["Time Travel"]);
  });

  it("never returns a built-in or a deleted custom chip", () => {
    rememberCustom("tags", "Slow burn");
    forgetCustom("tags", "Slow burn");
    expect(
      resolveCustom("tags", ["Isekai"], [["Isekai", "Slow burn"]])
    ).toEqual([]);
  });

  it("brings a deleted chip back when it is added again", () => {
    rememberCustom("warnings", "Grief");
    forgetCustom("warnings", "Grief");
    rememberCustom("warnings", "Grief");
    expect(resolveCustom("warnings", [], [])).toEqual(["Grief"]);
  });
});
