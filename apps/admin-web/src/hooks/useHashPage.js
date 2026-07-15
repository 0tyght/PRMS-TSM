import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PAGE, isAdminPage } from "../config/navigation.js";

function pageFromHash() {
  const page = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return isAdminPage(page) ? page : DEFAULT_PAGE;
}

export function useHashPage() {
  const [page, setPage] = useState(pageFromHash);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", `#/${DEFAULT_PAGE}`);
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback(nextPage => {
    const safePage = isAdminPage(nextPage) ? nextPage : DEFAULT_PAGE;
    const nextHash = `#/${safePage}`;
    if (window.location.hash === nextHash) setPage(safePage);
    else window.location.hash = nextHash;
    window.scrollTo({ top:0, behavior:"auto" });
  }, []);

  return { page, navigate };
}
