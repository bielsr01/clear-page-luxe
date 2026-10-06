import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// iPhone/iPad (o iPadOS se apresenta como Mac com touch). Usado no index.css para
// contornar o iframe do widget iFood, que no Safari bloqueia rolagens internas.
const nav = window.navigator;
if (/iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)) {
  document.documentElement.classList.add("ios");
}

createRoot(document.getElementById("root")!).render(<App />);
