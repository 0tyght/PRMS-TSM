import { useEffect, useState } from "react";
import { HashNavigation } from "@smart-thapho/web-core/hash-navigation";

const DEFAULT_PAGE = "dashboard";
const hashNavigation = new HashNavigation({ defaultPage: DEFAULT_PAGE });

function readRoute() {
  return hashNavigation.read();
}

export function useHashPage() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    return hashNavigation.subscribe(setRoute);
  }, []);

  const navigate = (nextPage) => hashNavigation.navigate(nextPage);
  return { page: route.page, query: route.query, navigate };
}
