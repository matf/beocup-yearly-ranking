# BEO-Cup Jahreswertung

Static Vue 3 + TypeScript web app (Vite, no backend) that computes the yearly individual
ranking ("Jahressieger:in") of the BEO-Cup swimming series from SPLASH Meet Manager
LENEX result files (`.lxf`).

- `REQUIREMENTS.md`: the requirements, numbered REQ 2–7. Read it first.
- `Regl_BEO-Cup.pdf`: the official rules (categories in §3, scoring in §5/§7, yearly
  ranking in §8.2).

## Commands

- `npm run dev`: dev server
- `npm test`: Vitest
- `npm run build`: **runs the tests, then the type check (`vue-tsc`), then the Vite build**. A failing test fails the build.
- `npm run typecheck`

TypeScript is pinned to 5.9 because vue-tsc does not support TypeScript 7 yet.

Deployment: `.github/workflows/pages.yml` builds on every push to `main` and publishes `dist/`
to GitHub Pages (https://matf.github.io/beocup-yearly-ranking/). Vite uses `base: './'`, so the
build works under any sub-path. In CI the real-results test is skipped because `results/` is not in git.

## Layout

- `src/core/`: pure domain logic. It imports no Vue, so it is unit-testable in Node.
  - `lenex.ts`: unzips `.lxf` (JSZip) and parses LENEX XML (fast-xml-parser) into `Cup`/`Entry`.
  - `normalize.ts`: name normalization and fuzzy name similarity.
  - `matching.ts`: groups entries into `Person`s (manual merges first, then auto-match on normalized name + birth year + gender; never two entries of the same cup, never a separated pair).
  - `issues.ts`: suspicious entries: swapped names, birth year/gender differs, same last name + exact birthdate (nicknames), similar name, inconsistent person.
  - `corrections.ts`: operator decisions (merge, separate, detach, override) as pure `Corrections → Corrections` functions, plus import validation.
  - `scoring.ts`: categories, Gesamtzeit per cup, yearly ranking.
  - `format.ts`: German labels and time formatting.
  - `__tests__/`: one `describe` per requirement (`REQ x – …`); `fixtures.ts` builds synthetic LENEX files.
- `src/store.ts`: reactive app state. Cups and corrections are persisted in `localStorage`; persons, issues and ranking are `computed` from them.
- `src/views/`: the tabs Cups, Prüfen, Schwimmer:innen, Rangliste, Druck.
- `src/components/`: shared components (entry table, person card, merge/edit/join forms, ranking table).

## Domain rules that are easy to get wrong

- **DSQ:** the LENEX `swimtime` of a DSQ is the raw time. Add **+3 s** (Reglement §2), *before* choosing the best 3 times. This was verified against the Meet Manager Mehrkampf totals in the CSV exports.
- **Valid time:** `time > 0` and status not DNS/DNF/WDR. DNS/WDR come with `00:00:00.00`.
- **Kat. V/IV (age ≤ 12):** the best 3 of up to 4 strokes count, Fly included. **Kat. III–I:** all 4 strokes are required.
- **Age** = cup year − birth year. This fixes the category for the whole year.
- **Eligible:** a valid Gesamtzeit at every loaded cup.
- **Only the 50 m individual events count.** Relays, 100 m and 400 m are ignored, and the relay Jahresmeisterschaft is out of scope. Identify events by `SWIMSTYLE` (stroke, distance 50, relaycount 1), never by event number.
- **Matching:**
  - Birthdates are often placeholders (`YYYY-01-01`), so matching uses the birth year only.
  - Club codes differ between files (INT/INTE), so the club is never part of the match key.
  - Twins exist (same club, same birthdate), so two entries of one cup are never merged.
- **Entry keys** are `${cupId}:${athleteid}`, with cupId = `${date}-${city-slug}`. Corrections refer to these keys, so they survive reloading files and adding new cups. Don't change the key format without a migration.

## Data

`results/` contains the real result files: the current year at the top level and in cup folders,
past years under `BEO Cup/Archiv/` (with SPLASH `.csv` exports and the official yearly PDFs).
They hold personal data and are **git-ignored**. `src/core/__tests__/real-results.test.ts` finds
every result `.lxf` (files with swim times) and checks each CSV's Mehrkampf column against our
per-cup totals (2024–2026, ~600 swimmers). It is skipped when the folder is missing.
**Never put real swimmer names or birthdates into committed files** – tests use fictional names
and the real-data test asserts only structure and counts.

## Conventions

- The UI language is German (Swiss: "ss" instead of "ß"). Code and comments are in English.
- Keep domain logic in `src/core` and covered by tests that reference the requirement; views stay thin.
- Commit messages: imperative, short. No AI co-author trailers.
