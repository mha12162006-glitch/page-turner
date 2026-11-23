export default function Stars({ v, on, size = "text-xl" }) {
  return (
    <span className={size}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!on}
          onClick={() => on(v === n ? 0 : n)}
          className={
            (n <= v ? "text-amber-400" : "text-stone-400/50") +
            " transition hover:scale-110"
          }
          aria-label={n + " hype"}
        >
          ♥
        </button>
      ))}
    </span>
  );
}
