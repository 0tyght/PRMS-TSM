import { useEffect, useState } from "react";

const DEFAULT_PAGE = "dashboard";

function readRoute() {
  const value = window.location.hash.replace(/^#\/?/, "").trim();
  const [path = DEFAULT_PAGE, query = ""] = value.split("?");
  return { page: path || DEFAULT_PAGE, query: new URLSearchParams(query) };
}

export function useHashPage() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = (nextPage) => { window.location.hash = `/${nextPage}`; };
  return { page: route.page, query: route.query, navigate };
}
