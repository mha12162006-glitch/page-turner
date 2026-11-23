import { useState } from "react";
import { sb } from "../lib/supabase";
import Logo from "./Logo";

export default function Auth() {
  const [email, setE] = useState("");
  const [pw, setP] = useState("");
  const [mode, setM] = useState("in");
  const [msg, setMsg] = useState("");
  const go = async (e) => {
    e.preventDefault();
    setMsg("");
    const { error, data } =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password: pw })
        : await sb.auth.signUp({ email, password: pw });
    if (error) setMsg(error.message);
    else if (mode === "up" && !data.session) {
      setMsg("Check your email to confirm your account, then sign in.");
    }
  };
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form
        onSubmit={go}
        className="w-full max-w-sm rounded-3xl bg-white/70 dark:bg-white/5 p-8 space-y-4 pop"
      >
        <div className="flex items-center gap-3">
          <Logo size={48} />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Manhwa Tracker
          </h1>
        </div>
        <p className="opacity-70">
          Your queue of manhwa, manga and manhua, saved to your account.
        </p>
        <input
          className="inp"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setE(e.target.value)}
          required
        />
        <input
          className="inp"
          type="password"
          placeholder="Password (6+ characters)"
          value={pw}
          onChange={(e) => setP(e.target.value)}
          minLength={6}
          required
        />
        {msg && <p className="text-sm text-rose-500">{msg}</p>}
        <button className="w-full rounded-xl bg-plum text-white font-bold py-2.5 hover:brightness-110">
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="text-sm underline opacity-70"
          onClick={() => setM(mode === "in" ? "up" : "in")}
        >
          {mode === "in"
            ? "New here? Create an account"
            : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
