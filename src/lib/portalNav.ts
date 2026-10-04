// The client portal is served under /host (canonical, neutral). This helper used to
// mirror a legacy /couple base; /couple is gone, so it always returns /host. Kept as
// a function so the many call sites stay unchanged and read clearly.
export function portalBase(): '/host' {
  return '/host'
}
