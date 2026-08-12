import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PAGE, isAdminPage } from "../config/navigation.js";
import { HashNavigation } from "@smart-thapho/web-core/hash-navigation";

const hashNavigation = new HashNavigation({ defaultPage: DEFAULT_PAGE });

function pageFromHash() {
  const page = hashNavigation.read().page;
  return isAdminPage(page) ? page : DEFAULT_PAGE;
}

export function useHashPage() {
  const [page, setPage] = useState(pageFromHash);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", `#/${DEFAULT_PAGE}`);
    return hashNavigation.subscribe(() => setPage(pageFromHash()));
  }, []);

  const navigate = useCallback(nextPage => {
    const safePage = isAdminPage(nextPage) ? nextPage : DEFAULT_PAGE;
    hashNavigation.navigate(safePage);
    window.scrollTo({ top:0, behavior:"auto" });
  }, []);

  return { page, navigate };
}
