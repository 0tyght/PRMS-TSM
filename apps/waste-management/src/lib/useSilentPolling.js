import { useEffect, useRef } from "react";

export function useSilentPolling(task, { intervalMs, enabled = true } = {}) {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) {
      return undefined;
    }

    let disposed = false;

    const run = async (silent) => {
      if (disposed || inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        await task({ silent });
      } finally {
        inFlightRef.current = false;
      }
    };

    const refreshIfVisible = () => {
      if (!document.hidden) void run(true);
    };

    void run(false);

    const timer = window.setInterval(refreshIfVisible, intervalMs);
    const onVisibilityChange = () => {
      if (!document.hidden) void run(true);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener("pageshow", refreshIfVisible);
    window.addEventListener("online", refreshIfVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener("pageshow", refreshIfVisible);
      window.removeEventListener("online", refreshIfVisible);
    };
  }, [enabled, intervalMs, task]);
}
