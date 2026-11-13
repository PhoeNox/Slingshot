# Hash routing

Each screen has a URL hash route: `#/` for the main menu, `#/play` for a match, `#/credits` (later `#/settings`). The site is served from GitHub Pages under a subpath, and Pages has no fallback for unknown paths, so History API paths would 404 on reload without a `404.html` redirect workaround. Hash routes need no server support. Leaving `#/play` abandons the match, reloading it starts a fresh one, and an unknown hash is replaced with `#/`.
