import { useEffect, useState } from "react";
import Auth from "./components/Auth";
import { applyTheme } from "./lib/theme";
import { configured, sb } from "./lib/supabase";
import Shared from "./pages/Shared";
import Tracker from "./pages/Tracker";

function Setup() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md rounded-3xl bg-white/70 dark:bg-white/5 p-8 pop">
        <h1 className="text-3xl font-extrabold">Almost there</h1>
        <p className="mt-3 opacity-80">
          Add a file named <code>config.js</code> next to index.html containing
          your Supabase Project URL and anon key, then reload.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("pt-dark")
        ? localStorage.getItem("pt-dark") === "1"
        : matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("pt-dark", dark ? "1" : "0");
    } catch (e) {}
  }, [dark]);
  const [hash, setHash] = useState(location.hash);
  const [session, setSession] = useState(undefined);
  const [t, setT] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("mt-theme")) || {
          preset: "Lavender",
          grad: true
        }
      );
    } catch (e) {
      return { preset: "Lavender", grad: true };
    }
  });
  useEffect(() => {
    applyTheme(t, dark);
    try {
      localStorage.setItem("mt-theme", JSON.stringify(t));
    } catch (e) {}
  }, [t, dark]);
  useEffect(() => {
    const h = () => setHash(location.hash);
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!configured) return <Setup />;
  const m = hash.match(/^#\/share\/([\w-]+)(?:\/([\w-]+))?/);
  if (m) {
    return (
      <Shared
        uid={m[1]}
        sid={m[2]}
        dark={dark}
        setDark={setDark}
        me={session === undefined ? undefined : session?.user || null}
      />
    );
  }
  if (session === undefined) return null;
  return session ? (
    <Tracker user={session.user} dark={dark} setDark={setDark} th={{ t, setT }} />
  ) : (
    <Auth />
  );
}
