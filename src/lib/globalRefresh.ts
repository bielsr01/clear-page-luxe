import { useEffect } from "react";

const EVENT = "global-refresh";

export function emitGlobalRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function useGlobalRefresh(handler: () => void | Promise<void>) {
  useEffect(() => {
    const fn = () => { void handler(); };
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
  }, [handler]);
}
