import { FORMATS } from "../lib/util";

export default function Filters({ f, setF, items }) {
  const uniq = (k) =>
    [
      ...new Set(
        items.flatMap((i) => (Array.isArray(i[k]) ? i[k] : [i[k]]))
          .filter(Boolean)
      )
    ].sort();
  const S = ({ k, label, opts }) => (
    <select
      className="inp sm:!w-auto"
      value={f[k]}
      onChange={(e) => setF({ ...f, [k]: e.target.value })}
    >
      <option value="">{label}</option>
      {opts.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:items-center">
      <input
        className="inp col-span-2 sm:!w-48"
        placeholder="Search my list"
        value={f.q}
        onChange={(e) => setF({ ...f, q: e.target.value })}
      />
      <S k="format" label="Category" opts={FORMATS} />
      <S k="tag" label="Trope" opts={uniq("tags")} />
      <S k="source" label="Source" opts={uniq("source")} />
      <button
        onClick={() => setF({ ...f, top: !f.top })}
        className={
          "rounded-full px-4 py-2 text-sm font-bold " +
          (f.top ? "bg-amber-400 text-black" : "bg-plum/10")
        }
      >
        ★ Top picks
      </button>
    </div>
  );
}
