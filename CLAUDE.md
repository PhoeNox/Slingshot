## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary plus `done` (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix, done), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.

## Navigation

Module map: `docs/architecture.md`. Read the modules a ticket's `Touches:` line names instead of dumping `src/`.

## Review

Coding standards: `CODING_STANDARDS.md`, applied by `/mattpocock-skills:code-review` before a commit, not read during implementation. `git commit` runs `npm run check` (typecheck, oxlint, vitest) through `.githooks/pre-commit`; a failing hook means fix and recommit.
