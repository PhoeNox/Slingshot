# Coding standards

Applied at review (`/mattpocock-skills:code-review`). Mechanical rules live in `.oxlintrc.json` and `npm run check`; this file holds the judgement calls.

## Sources

Apply every rule in these files:

- `~/.claude/memory/feedback_code_engineering_principles.md`: IOSP, KISS/YAGNI, domain logic apart from I/O, no inline construction in arguments (production code only), sparse comments, trust-boundary error handling, commit message shape.
- `~/.claude/memory/feedback_code_style.md`: no underscore prefix on private members; multi-line boolean expressions break before the operator.

## Repo rules

- `src/core/` stays deterministic: no DOM, canvas, `Date`, `performance`, or `Math.random`. Randomness comes from the match's seeded `Rng` (ADR-0001).
- Rendering decisions live in `frame.ts` as `FrameItem` data; `renderer.ts` only draws them. New visual behaviour gets a `frame.test.ts` case.
- Match the surrounding formatting by hand: double quotes, semicolons, two-space indent. No formatter.
- New files carry the SPDX header (`SPDX-FileCopyrightText` and `SPDX-License-Identifier: GPL-3.0-or-later`), or a `REUSE.toml` annotation when the format has no comments.
