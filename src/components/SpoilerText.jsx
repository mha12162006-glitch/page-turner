import { Fragment, useEffect, useMemo, useState } from "react";
import { parseSpoilers } from "../lib/spoilers";

const toggleIn = (set, index) => {
  const next = new Set(set);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
};

/**
 * Renders [bracketed] text as a blurry, keyboard-revealable spoiler. Text is
 * always rendered as React text nodes; no HTML is ever injected.
 */
export default function SpoilerText({ text = "", className = "" }) {
  const tokens = useMemo(() => parseSpoilers(text), [text]);
  const spoilers = tokens.filter((token) => token.type === "spoiler");
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    setOpen(new Set());
  }, [text]);

  const allOpen = spoilers.length > 1 && open.size === spoilers.length;
  const toggleAll = () => {
    setOpen(
      allOpen ? new Set() : new Set(spoilers.map((_, index) => index))
    );
  };

  let index = -1;
  return (
    <span className={className}>
      {tokens.map((token, tokenIndex) => {
        if (token.type === "text") {
          return <Fragment key={tokenIndex}>{token.value}</Fragment>;
        }
        index += 1;
        const spoilerIndex = index;
        const revealed = open.has(spoilerIndex);
        return (
          <span
            key={tokenIndex}
            role="button"
            tabIndex={0}
            aria-label="Spoiler, tap to reveal"
            aria-expanded={revealed}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((current) => toggleIn(current, spoilerIndex));
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              setOpen((current) => toggleIn(current, spoilerIndex));
            }}
            className={
              "cursor-pointer rounded px-0.5 outline-none " +
              "focus-visible:ring-2 focus-visible:ring-plum " +
              (revealed
                ? "bg-plum/10"
                : "select-none blur-[4px] bg-plum/15")
            }
          >
            {token.value}
          </span>
        );
      })}
      {spoilers.length > 1 && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleAll();
          }}
          className="ml-2 rounded-full bg-plum/15 px-2 py-0.5 align-middle text-[11px] font-bold"
        >
          {allOpen ? "Hide all" : "Reveal all"}
        </button>
      )}
    </span>
  );
}
