# Slingshot

A browser port of Slingshot, the two-player, turn-based gravity artillery game: missiles are bent by the gravity of planets on their way to the opposing ship. Two players share one keyboard and take shots in alternation.

Controls: ←/→ or A/D angle · ↑/↓ or W/S power · Shift ×2.5 · Space fire

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # unit tests (Vitest)
npm run build   # static build into dist/
```

A push to `main` builds the site and deploys it to GitHub Pages.

## Credits

Slingshot was created by Jonathan Musther and Bart Mak, with later contributions by Marcus Dreier and Ryan Kavanagh. The original Python/pygame game lives at <https://github.com/ryanakca/slingshot>. The sprites and the FreeSansBold font in `public/data/` are taken from it.

## Licence

This port is licensed under the GNU General Public License, version 3 or (at your option) any later version (GPL-3.0-or-later); see [LICENSE](LICENSE). The original game is released under GPL-2.0-or-later.
