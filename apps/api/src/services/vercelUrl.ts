export function restoreApiRequestUrl(requestUrl = "/"): string {
  const url = new URL(requestUrl, "http://vercel.local");
  const routedPath = url.searchParams.get("__path");
  if (routedPath === null) return `${url.pathname}${url.search}`;

  url.searchParams.delete("__path");
  const safePath = routedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const query = url.searchParams.toString();
  return `${safePath ? `/api/${safePath}` : "/api"}${query ? `?${query}` : ""}`;
}
