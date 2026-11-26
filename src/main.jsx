import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

if ("serviceWorker" in navigator) {
  addEventListener("load", () =>
    navigator.serviceWorker
      .register((import.meta.env.BASE_URL || "./") + "sw.js")
      .catch(() => {})
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
