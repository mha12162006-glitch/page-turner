import { useRef, useState } from "react";
import { resizeImg } from "../lib/util";
import Avatar from "./Avatar";

export default function ProfilePanel({ user, prof, items, onSave, onClose }) {
  const [name, setName] = useState(prof.display_name || "");
  const [bio, setBio] = useState(prof.bio || "");
  const [av, setAv] = useState(prof.avatar_url || "");
  const [pub, setPub] = useState(!!prof.is_public);
  const fr = useRef();
  const togglePub = () => {
    if (!pub) {
      const ok = confirm(
        "Turn on your public link? Anyone with the link can see your list, even without signing in. You can turn it off again at any time."
      );
      if (!ok) return;
    }
    setPub((v) => !v);
  };
  const pick = async (e) => {
    const f = e.target.files[0];
    if (f)
      try {
        setAv(await resizeImg(f));
      } catch (x) {
        alert("That image could not be read. Try a JPG or PNG.");
      }
  };
  const n = (k) => items.filter((i) => i.status === k).length;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="drawer w-full max-w-sm h-full bg-paper p-6 space-y-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-extrabold">My profile</h2>
          <button onClick={onClose} className="text-2xl px-2" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex flex-col items-center gap-3">
          <Avatar url={av} name={name || user.email} size={112} />
          <div className="flex gap-2">
            <button
              onClick={() => fr.current.click()}
              className="rounded-full bg-plum/15 font-bold px-4 py-1.5 text-sm"
            >
              Upload photo
            </button>
            {av && (
              <button
                onClick={() => setAv("")}
                className="rounded-full px-4 py-1.5 text-sm underline opacity-70"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fr}
            type="file"
            accept="image/*"
            hidden
            onChange={pick}
          />
        </div>
        <label className="block">
          <span className="text-sm font-semibold opacity-70">Display name</span>
          <input
            className="inp"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should friends call you?"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold opacity-70">About me</span>
          <textarea
            className="inp"
            rows={3}
            maxLength={200}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Favorite genres, tropes, anything"
          />
        </label>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["Reading", n("reading")],
            ["Want to read", n("want")],
            ["On hiatus", n("hiatus")],
            ["Completed", n("done")]
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-plum/10 p-3">
              <p className="text-2xl font-extrabold">{v}</p>
              <p className="text-xs opacity-70">{l}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-plum/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold">Public share link</p>
              <p className="text-xs opacity-70">
                {pub
                  ? "On — anyone with the link can see your list."
                  : "Off — only you can see your list."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pub}
              aria-label="Public share link"
              onClick={togglePub}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition " +
                (pub ? "bg-plum" : "bg-plum/25")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition " +
                  (pub ? "translate-x-5" : "")
                }
              />
            </button>
          </div>
        </div>
        <p className="text-sm opacity-60">Signed in as {user.email}</p>
        <button
          onClick={() =>
            onSave({
              display_name: name.trim() || null,
              bio: bio.trim() || null,
              avatar_url: av || null,
              is_public: pub
            })
          }
          className="w-full rounded-xl bg-plum text-white font-bold py-2.5 hover:brightness-110"
        >
          Save profile
        </button>
      </div>
    </div>
  );
}
