import { useEffect } from "react";

export default function useLeafletResize(mapRef, rootRef) {
  useEffect(() => {
    const map = mapRef.current;
    const root = rootRef.current;
    if (!map || !root) return undefined;

    let frame = 0;
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };

    refresh();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(refresh);
    observer?.observe(root);
    window.addEventListener("resize", refresh);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
    };
  }, [mapRef, rootRef]);
}
