export default function Avatar({ url, name, size = 40 }) {
  return url ? (
    <img
      src={url}
      alt=""
      style={{ width: size, height: size }}
      className="rounded-full object-cover"
    />
  ) : (
    <span
      style={{ width: size, height: size, fontSize: size / 2.2 }}
      className="rounded-full bg-plum text-white font-extrabold grid place-items-center"
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
