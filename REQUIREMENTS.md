# BEO-Cup Jahreswertung – Requirements

## 1. Goal and scope

A static web app that reads the LENEX result files (`.lxf`) of the BEO-Cups of one year
and produces the printable **yearly ranking for individual swimmers** (Jahresmeister:in,
Reglement §8.2): one winner per category and gender.

It replaces a manual process in which the yearly totals were typed by hand from each
cup's Mehrkampf list into a separate SPLASH "Jahreswertung" meet. Comparing 2024 and 2025
showed that this process produced errors: wrong lists used, typing errors, swimmers split
by name variants or club changes, and whole categories missing.

It also checks the clubs' entries (Meldungen) for an upcoming cup (section 9).

Out of scope: the relay Jahresmeisterschaft (§8.1), Tagessieger, editing race results,
multiple users and logins.

## 2. Rules from the Reglement (edition 2026)

The Reglement PDF is not in the repository because it names a private person. Only these
parts matter for this app:

- **§1 Ausser Konkurrenz:** squad swimmers (Regional-/Nationalkader) of Kat. I and II
  start "ausser Konkurrenz" (aK) when they swim at all. Their time is listed with "aK".
- **§2 DSQ:** a rule violation in the individual races adds a **3 s penalty** to the time.
- **§3 Categories:** see section 4 below.
- **§5 Distances:**
  - Kat. V and IV swim a Dreikampf (Back, Breast, Free). Fly may be swum additionally,
    and the **3 best times** count.
  - Kat. III, II and I swim a Vierkampf: all 4 strokes.
- **§7:** one Mehrkampf ranking per category and gender, using the cumulated times.
- **§8.2:** one yearly winner per category. **Only swimmers who took part in all BEO-Cups
  of the year qualify.** There is no fallback rule: if nobody qualifies, the category has no
  winner.

## 3. Input

- The BEO-Cup result files of one year: `.lxf` (a zipped LENEX 3.0 export from SPLASH
  Meet Manager), or an unzipped `.lef`/`.xml`.
- The number of cups per year is configurable (default **5**). With fewer cups loaded,
  the ranking is an interim one ("Zwischenstand nach x von 5 Cups").
- Only the four individual **50 m** events count (`SWIMSTYLE distance=50 relaycount=1`,
  strokes FLY/BACK/BREAST/FREE). Relays, 100 m and 400 m are ignored. Event numbers differ
  between files, so events are identified by stroke.
- A cup is identified by date + city (`2026-08-22-thun`); an entry by cup + LENEX
  `athleteid`.
- SPLASH uses the same format for three kinds of file, told apart by content:
  - result file: athletes with `RESULT` elements
  - entry file (Meldung, from SPLASH Team Manager): athletes with `ENTRY` elements only
  - announcement (Ausschreibung): no athletes; it serves as template for entry files written
    by the app (9.4)

  The Cups tab accepts only result files and names the kind of a rejected file.

## 4. Categories

Age = cup year − birth year (LENEX `AGEDATE type=YEAR`). The category stays the same for
the whole year. Boys and girls are ranked separately, which gives 10 rankings.

| Kat. | Age   | Label            | Gesamtzeit of one cup                    |
|------|-------|------------------|------------------------------------------|
| V    | ≤ 10  | Mädchen / Knaben | sum of the 3 fastest valid times (of ≤ 4) |
| IV   | 11–12 | Mädchen / Knaben | sum of the 3 fastest valid times (of ≤ 4) |
| III  | 13–14 | Mädchen / Knaben | sum of all 4 times                       |
| II   | 15–16 | Damen / Herren   | sum of all 4 times                       |
| I    | ≥ 17  | Damen / Herren   | sum of all 4 times                       |

Kat. I belongs to the yearly ranking: it is excluded only from the Tagessieg.

## 5. Scoring

- **Valid time:** `swimtime` > 0 and the status is not DNS, DNF or WDR. DNS and WDR come
  with `00:00:00.00`.
- **DSQ:** the time counts plus **3 s**. The LENEX `swimtime` does **not** include the
  penalty; SPLASH adds it only in its Mehrkampf list. The penalty is added **before** the
  best 3 are chosen, so it can change which strokes count.
- **aK (status EXH on an individual 50 m result):** that cup does not count, so the swimmer
  is not eligible. The reason shows as "ausser Konkurrenz".
- **Gesamtzeit of a cup:** see the table in section 4. If too few valid times exist, the cup
  does not count.
- **Yearly total:** the sum of the Gesamtzeiten of all cups.
- **Eligible:** a valid Gesamtzeit at **every** loaded cup.
- **Ties:** equal totals share a rank (1, 2, 2, 4).

**Verified:** the per-cup Gesamtzeiten match SPLASH's own Mehrkampf column in the CSV
exports exactly, for every swimmer of every cup from 2024 to 2026 that has a CSV (about
600 swimmers, about 75 of them with a DSQ penalty). The real-data test checks this on
every local build.

## 6. Identifying swimmers across cups

Each file has its own athlete IDs. Problems found in the real data (examples are fictional):

- placeholder birthdates (`YYYY-01-01`) next to real ones, and occasionally wrong
  birthdates or birth years
- spelling variants: typos (Timm/Tim), accents (Novák/Novak), name prefixes
  (Vries/De Vries), an extra first name (Florian/Florian Matteo), double last names
- nicknames (Sepp/Josef) with the same last name and birthdate, and last names misspelt
  beyond the similarity threshold (Hauser/Hausmann) with the same first name and birthdate
- first and last name swapped; a wrong gender
- different club codes for the same club (INT/INTE), and club changes during the year
- twins in the same club with the same birthdate, who must never be merged

### 6.1 Automatic matching
Entries are the same person when normalized last name + first name + birth year + gender
are equal. Normalizing means:
- lower case, accents removed, ß → ss
- hyphens and punctuation turned into spaces, whitespace collapsed

The club is **not** part of the key. Two entries of the **same cup** are never merged.

### 6.2 Suspicious entries
These are reported only for pairs of persons who never appear in the same cup, and are not
marked as different persons:

| Type | Rule |
|---|---|
| Vor-/Nachname vertauscht | first/last name of A = last/first name of B |
| Jahrgang unterschiedlich | same normalized name, different birth year |
| Geschlecht unterschiedlich | same normalized name, different gender |
| Gleiches Geburtsdatum | same gender and exact birthdate (not `YYYY-01-01`), and the same normalized last name **or** first name: nicknames (Sepp/Josef) and badly misspelt last names (Hauser/Hausmann) |
| Ähnlicher Name | same gender, birth year ±1, and either every name part of one name matches a distinct part of the other (equal, a prefix of ≥ 3 characters, or similarity ≥ 0.8), or the first names are equal and the last names at least 0.6 similar (Brunner/Brummer) |
| Widersprüchliche Angaben | a person (after a manual merge) whose entries differ in normalized name, birth year or gender |

For each issue the operator chooses one of:
- **Same person:** merge, and choose the correct name, birth year and gender. Only the
  fields that differ from the file are stored as overrides.
- **Different persons:** the pair is never reported again.
- **Edit single entries** (6.3).

### 6.3 Single entries
Each entry can be edited (first and last name, birth year, gender) or reset to the file
values. It can be joined with another person (only persons without a shared cup are
offered, most similar first) or detached from its person.

### 6.4 Corrections
The decisions are stored as JSON:
`{format:"beocup-corrections", version:1, merges, separations, overrides, settings}`.
- merges and separations are pairs of entry keys
- overrides are keyed by entry key

The app saves them in the browser (`localStorage`) automatically and can export and
import them as a file. Because they use entry keys, they stay valid when a cup is added.
The exported file contains names, so it must never be committed.

## 7. Web app

- Vue 3 + TypeScript + Vite as a static build with no backend. The files are parsed in the
  browser and never uploaded anywhere.
- The UI is in German.
- Tabs:
  1. **Cups:** load files (drag and drop, several at once), list or remove cups, set the
     number of cups per year, and export/import/reset the corrections.
  2. **Prüfen:** suspicious entries with their actions; the tab shows the number of open issues.
  3. **Schwimmer:innen:** all persons, with search and filters (all; at all cups; not at all
     cups; corrected). Each person shows its entries per cup (times, DSQ marked,
     placeholder birthdates marked) with edit, join and detach.
  4. **Rangliste:** per category and gender, with a warning when the ranking is interim or
     issues are unresolved. The non-eligible swimmers can be shown.
  5. **Druck:** A4 output through the browser's print/PDF function. Three optional sections:
     - the Jahressieger:innen summary
     - the full table: rank, name, birth year, club, the Gesamtzeit of each cup, total, gap
       to the leader
     - the non-eligible swimmers: each cup's outcome or the reason (nicht gestartet,
       abgemeldet, ausser Konkurrenz, nur n gültige Zeiten)
  6. **Meldungen:** checks the entries for an upcoming cup, see section 9.
- The name shown is the one of the most recent cup.
- **Clubs:** always the same six clubs take part. The files use varying codes and names for
  them: old names, old codes and typos. So the app shows each club's official name, derived
  from its code (`src/core/clubs.ts`). The official names and codes are those of the
  [Swiss Aquatics member list](https://www.swiss-aquatics.ch/verband/mitglieder/alle-mitgliedvereine/)
  (checked October 2026). Schulsport Saanenland is not a Swiss Aquatics member; its name is
  the one used in the Reglement.

  | Codes | Shown as |
  |---|---|
  | INT, INTA, INTE | Interlaken Aquatics 1930 |
  | UET | Schwimmclub Delphin Uetendorf |
  | SAAN | Schulsport Saanenland |
  | SCFR | Schwimmclub Frutigen |
  | SCSP | Schwimmclub Spiez |
  | THUN, SKT | Schwimmklub Thun |

  Background on the variants:
  - INTE and "(SK / Schwimmklub) Bödeli Interlaken" are the old code and name of Interlaken
    Aquatics 1930. INTA is the code in its 2026 entry files.
  - SKT is the old code of Schwimmklub Thun.
  - "SC Delphin Uetendorf" is the short form of the Uetendorf name.
  - "Schwimmclup Spiez" is a typo in the files.

  An unknown code keeps the file's name. One case is Startgemeinschaft Berner Oberland (BEO),
  the clubs' joint competition team and itself a Swiss Aquatics member, under which a few
  swimmers were registered in 2024. The entry table in Schwimmer:innen and Prüfen
  still shows the name exactly as written in each file.

## 8. Quality

- The domain logic (`src/core`) is pure TypeScript with Vitest unit tests on synthetic
  LENEX fixtures, one `describe` per requirement.
- `npm run build` runs the tests, then the type check, then the build. CI deploys only a
  green build.
- A real-data test runs locally against `results/` (git-ignored). For every year it checks:
  - the per-cup totals and categories against the SPLASH exports (CSV/TXT), and that swimmers
    without a SPLASH Mehrkampf total don't count for that cup
  - every Mehrkampf row of the published Rangliste PDFs: total, counted strokes, DSQ marks and
    the partial sums of incomplete rows. Ties and preliminary rankings that a later list replaced
    are handled. This needs poppler (`pdftotext`, `pdfinfo`).
  - that every entry of a cup resembling a swimmer marked "not started" there is reported as a
    suspicious pair
  - matching, issue detection and the ranking
  - the Word forms: every swimmer line is read with 3–4 readable strokes and no error, no
    swimmer line is among the ignored lines, over 90 % get their gender from the results, and
    the generated entry file reads back with the same strokes
  - the entry files: each file in a `Meldungen` folder is recognised as one, newer files replace
    older ones, nearly every swimmer entered for a past cup is found in that cup's results, and
    fewer than 10 % of the entries have errors
- **No real personal data in the repository:** no names, birthdates or contacts of
  swimmers or officials, in code, tests, docs or commit messages.

## 9. Checking entries (Meldungen)

Before a cup, each club sends its entries as a LENEX file from SPLASH Team Manager. The tab
**Meldungen** checks them. It is independent of the yearly ranking.

### 9.1 Files
- The tab accepts any LENEX file and recognises its kind (section 3):
  - **entry files** are checked
  - **result files of any year** become comparison results. They never count for the ranking.
    A button copies the cups of the yearly ranking into them.
  - announcements are rejected
- Entry files differ from result files:
  - one club per file, sometimes two (e.g. the Startgemeinschaft and a club)
  - entries in other events (100 m, 400 m, relays), which are ignored
  - the cup date comes from the `SESSION`, the creation time from the `LENEX created` attribute
    (missing in older Team Manager versions: the file's modification time is used)
- **Several files from one club for the same cup:** the newest file replaces the older ones
  (by creation time, then by load order). Clubs are compared by their current name (section 7),
  so INT and INTA are the same club. The file list shows which file replaced which.
- Loading a file with the same name for the same cup again replaces it.
- Entry files and comparison results are stored in the browser (`localStorage`) and can be
  removed one by one or all at once.

### 9.2 Checks per entered swimmer
The category is computed from the cup year, as in section 4. The operator's corrections
(section 6.4) also apply to the comparison results, because they are keyed by entry key.

| Check | Severity |
|---|---|
| Kat. V/IV entered for fewer than 3 strokes | error, naming the missing strokes |
| Kat. V/IV entered for 3 or more strokes, but Fly instead of Back, Breast or Free | warning (§5: V/IV swim Back, Breast, Free; Fly is optional) |
| Kat. III–I not entered for all 4 strokes | error, naming the missing strokes |
| No 50 m individual stroke, only other events | warning; nothing entered at all: error |
| Entered in an event of the other gender | error |
| Same name in the comparison results with another birth year or gender, and no exact match | error, naming the values and the most recent cup |
| Exact match (name, birth year, gender), but another person with the same name and other data exists in the results | warning |
| Exact match, but a different exact birthdate (placeholders ignored, as are birthdates whose year the operator corrected) | warning |
| No exact match, but a similar name by the rules of section 6.2 (similar, swapped, same birthdate) | warning, naming the person found |
| Entered twice for the same cup (two clubs, or twice in one file) | warning |
| Not in the comparison results | info |
| Placeholder birthdate (`YYYY-01-01`) | info |
| Club code not one of the six clubs | info |

### 9.3 Display
- One table per cup, grouped by club: name, birth year, gender, category, the four strokes
  (✓ entered, – missing, · Fly not required) and the findings.
- Filters: only errors and warnings (default), only errors, all; search by name or club.
- The tab shows the number of swimmers with an error or warning. The list can be printed.

### 9.4 Word entry forms (Gstaad)
Gstaad has no Team Manager and enters its swimmers with a Word form. The Meldungen tab turns
the form into a LENEX entry file for the import into the Meet Manager. Everything runs in the
browser.

- **Input:** two files uploaded explicitly in the section «Word-Meldung umwandeln»:
  1. the cup's announcement (`.lxf`): meet name, city, date and all events with their ids and
     numbers. Other files are rejected there.
  2. the Word form (`.doc` Word 97–2003, or `.docx`)
- **Form:** one line per swimmer, `Lastname Firstname <tab> YY <tab> Fly <tab> Back <tab>
  Breast <tab> Free`. The year has two digits (`09` = 2009). `---`, `x` and empty cells mean
  not entered. Relays are not converted.
- **Nothing uncertain is filled in silently.** Each row shows three kinds of message:

  | Kind | Cases | Effect |
  |---|---|---|
  | Error | gender unknown; year missing or unreadable; unreadable time; more than 4 times; no time; name of one word | must be fixed in the table |
  | Question | a typo read as a time (`42.18j` → 42.18, `52:00` → 52.00); a stray empty cell dropped (times may be shifted); an unknown name of 3+ words split before the last word; the name found in the results only with another birth year | must be confirmed per row («geprüft, stimmt so») or fixed |
  | Info | not in the comparison results; birthdate only as year | none |

  The download is possible only without errors and with every question confirmed.
- A line with a name and at least two times but no readable year is kept as a row with an
  error, never dropped. All lines that are not taken over (title, header, relays, remarks) are
  listed so the operator can check that nobody is missing.
- **Prepared from the comparison results** (section 9.1), because the form has no gender or
  birthdate:
  - The name is split where last and first name match a person in the results; otherwise
    before the last word (a question for 3+ words).
  - Gender only from a person with the same name **and birth year** and a single gender.
    Otherwise the operator chooses it.
  - Birthdate: the real one from such a person, otherwise `YYYY-01-01`, the usual placeholder of
    the SPLASH files for "year only".
- **Editing:** name, birth year, gender and the times can be edited, rows removed.
- **Output:** `Meldung SAAN <meet>.lxf`, a zipped LENEX like a Team Manager export:
  - club **SAAN / Schulsport Saanenland**, as in the results
  - all events of the announcement; one `ENTRY` with entry time per entered 50 m stroke, using
    the announcement's event id for the stroke and the swimmer's gender
  - the generated file is added to the checks (9.2) at once
- Whether the Meet Manager imports the file must be verified on the first real import.
