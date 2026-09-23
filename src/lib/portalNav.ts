// The client portal is served under two bases:
//   /host   — canonical, neutral (what we share and link to going forward)
//   /couple — legacy alias, still live so older links, QRs and emails keep working
// Internal navigation mirrors whichever base the user is currently in, so the URL
// stays consistent through a session. The demo runs under /couple and is
// unaffected. The post-login callback always lands on /host (the canonical base).
export function portalBase(pathname: string = window.location.pathname): '/host' | '/couple' {
  return pathname.startsWith('/host') ? '/host' : '/couple'
}
