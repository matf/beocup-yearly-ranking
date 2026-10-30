# BEO-Cup Jahreswertung

A static Vue 3 + TypeScript app (Vite, no backend). It computes the yearly individual
ranking of the BEO-Cup swimming series from SPLASH Meet Manager LENEX result files.
`REQUIREMENTS.md` holds all domain rules (Reglement 2026 summary, scoring, matching, UI).
**Read it first.** `LENEX.md` documents the LENEX files as SPLASH writes them (file kinds,
structure, event ids, statuses, writing entry files that Meet Manager imports).

Live at https://matf.github.io/beocup-yearly-ranking/ (repo `matf/beocup-yearly-ranking`).

## Commands

- `npm run dev`: dev server
- `npm test`: Vitest
- `npm run build`: **runs the tests, then `vue-tsc`, then the Vite build**. A failing test fails the build and the deploy.
- `npm run typecheck`

The real-data test (`real-results.test.ts`) runs only where `results/` exists. Its Rangliste PDF
checks need poppler (`brew install poppler`) and are skipped without it.

TypeScript is pinned to ~5.9: vue-tsc does not support TypeScript 7 yet.

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main`.
`base: './'` keeps the build path-independent.

## Layout

- `src/core/`: pure domain logic. It imports no Vue.
  - `lenex.ts`: unzips the file (JSZip), parses it (fast-xml-parser) and tells result files (`Cup`), entry files (`EntryFile`) and announcements apart.
  - `normalize.ts`: name normalization and similarity.
  - `matching.ts`: groups entries into `Person`s: manual merges first, then the auto key.
  - `issues.ts`: suspicious entries (REQUIREMENTS §6.2).
  - `corrections.ts`: operator decisions as pure `Corrections → Corrections` functions, and import validation.
  - `scoring.ts`: categories, the per-cup outcome (`ok|absent|withdrawn|exhibition|incomplete`) and the ranking.
  - `format.ts`: German labels and times.
  - `clubs.ts`: the six clubs; maps file club codes to the current club name for display.
  - `wordform.ts`: reads Word entry forms (`.doc` via `cfb` + the Word 97 piece table, `.docx` via JSZip) and prepares the swimmers.
  - `lenexWriter.ts`: writes a LENEX entry file from an announcement template.
  - `entries.ts`: the Meldungen checks (REQUIREMENTS §9): newest file per cup and club, disciplines per category, cross-check against the comparison results.
  - `__tests__/`: one `describe` per requirement. `fixtures.ts` builds synthetic LENEX files. `real-results.test.ts` is the local real-data check.
- `src/store.ts`: reactive state. Cups, corrections and the Meldungen tab's files live in `localStorage`; persons, issues, ranking and entry checks are `computed`.
- `src/views/`: the tabs Cups, Prüfen, Schwimmer:innen, Rangliste, Druck, Meldungen (`EntriesView`).
- `src/components/`: shared components; `WordConvert.vue` is the Word form converter of the Meldungen tab.

## Easy to get wrong

- **DSQ:** add +3 s to the raw LENEX time, **before** picking the best 3.
- **Status:** EXH (aK) makes the cup not count. DNS/DNF/WDR and a zero time are invalid.
- **Kat. V/IV:** the best 3 of ≤ 4 strokes count, Fly included. **Kat. III–I:** all 4 strokes. Kat. I is ranked too.
- **Events:** identify them by `SWIMSTYLE`, never by event number. Only 50 m individual events count.
- **Matching:**
  - The key uses the birth year only, because `YYYY-01-01` placeholders are common.
  - The club is never in the key: codes vary (INT/INTE) and swimmers change clubs.
  - Never merge two entries of the same cup (twins).
- **Clubs:** display names come from `clubs.ts` by code, because the files have old names and typos. The official names are the ones in the Swiss Aquatics member list, see REQUIREMENTS §7. Matching never uses the club.
- **Entry keys** are `${date}-${city-slug}:${athleteid}`. Corrections depend on them, so don't change the format without a migration.
- **SPLASH Rangliste PDFs:**
  - The total is followed by the number of strokes it contains (`2:33.863` = 2:33.86 from 3 strokes).
  - Times in `( )` don't count, and `*` marks a DSQ.
  - Tied swimmers after the first have no rank number.
  - Preliminary lists printed on the day can differ from the final ones.
- **Meldungen:**
  - Entry files have `ENTRY` instead of `RESULT`; announcements have no athletes. Only result files may become cups.
  - The Meldungen tab has its own state (`state.entries`: entry files and comparison cups of any year). It never feeds the ranking.
  - Kat. V/IV must enter Back, Breast and Free; Fly is optional. Fly in place of one of them is a warning, not an error.
  - The newest file per cup and club wins, by `LENEX created`, then load order. Compare clubs by `clubName()`, not by code.
- **Word forms (Gstaad):**
  - Never guess: missing values are errors, interpretations (typos, stray tabs, name splits, other birth year) are questions the operator confirms. Lines are never dropped silently.
  - No gender and no birthdate in the form: gender only from a result person with the same name and birth year, otherwise the operator chooses.
  - The Ausschreibung is uploaded explicitly in the converter; event ids and numbers come from it. Club is always SAAN.
  - Relays are not converted. Tests build `.doc`/`.docx` files synthetically (`fixtures.ts`), never commit real forms.
- **Testing in a browser:** reset the file `<input>` only after copying its `FileList`, because it is live.

## Personal data – strict

- `results/` and `meldungen/` hold the real files, git-ignored:
  - the current year at the top level and in `BEO Cup/2026-*`
  - past years in `BEO Cup/Archiv/`, with SPLASH CSV exports and the official yearly PDFs
- `.gitignore` also covers `*.lxf`, `*.lef`, exported `beocup-korrekturen-*.json` and `Regl_*.pdf`. The Reglement names a private person.
- **Never commit real names, birthdates, clubs+names or contacts.** That includes tests, docs and commit messages.
  - Use fictional names and dates.
  - Before using a value, check it does not occur in the real files. Even a single real first name with a real birthdate is personal data.
  - The real-data test asserts only counts and structure.
- Before pushing, scan the tracked files against all names and birthdates extracted from `results/**/*.lxf` and `meldungen/**/*.lxf`, and the names in the Word forms.

## Conventions

- The UI is in German (Swiss: "ss", not "ß"). Code and comments are in English.
- Domain logic goes in `src/core` with tests that reference a requirement. Views stay thin.
- Commit messages are imperative and short, with no AI co-author trailers.
