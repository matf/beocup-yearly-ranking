# BEO-Cup Jahreswertung – Requirements

## 1. Goal

A static web app that reads the LENEX result files (`.lxf`) of the BEO-Cups of one year
and produces the printable **yearly ranking for individual swimmers** ("Jahressieger:in",
Reglement BEO-Cup section 8.2): one winner per category and gender.

It replaces the manual "File Jahreswertung" process in SPLASH Meet Manager.

Out of scope: the relay Jahresmeisterschaft (Reglement 8.1), Tagessieger, editing race
results, multiple users and logins.

## 2. Input

- 1 to n BEO-Cup result files of one year. Each is an `.lxf` file (a zipped LENEX 3.0 export from SPLASH Meet Manager); an unzipped `.lef`/`.xml` is accepted too.
- The number of cups per year is configurable (default **5**). Before all cups have
  taken place, the app shows an interim ranking ("Zwischenstand nach x von 5 Cups").
- Only the four individual 50 m events count: Butterfly, Backstroke, Breaststroke and
  Freestyle (`SWIMSTYLE distance=50 relaycount=1`). Relays, 100 m and 400 m Freestyle
  are ignored.
  Event numbers and IDs differ between files, so events are identified by stroke.
- Each cup is identified by its date and city. Each entry is identified by the cup and
  the LENEX `athleteid`.

## 3. Categories (Reglement section 3)

Age = year of the cup − birth year (LENEX `AGEDATE type=YEAR`). A swimmer keeps the
same category for the whole year.

| Kat. | Age   | Mode      | Scoring                                   |
|------|-------|-----------|-------------------------------------------|
| V    | ≤ 10  | Dreikampf | best 3 of up to 4 strokes (Fly optional)  |
| IV   | 11–12 | Dreikampf | best 3 of up to 4 strokes (Fly optional)  |
| III  | 13–14 | Vierkampf | all 4 strokes                             |
| II   | 15–16 | Vierkampf | all 4 strokes                             |
| I    | ≥ 17  | Vierkampf | all 4 strokes                             |

Boys and girls are ranked separately, which gives 10 rankings.
The labels are Mädchen/Knaben for Kat. V–III and Damen/Herren for Kat. II–I.

## 4. Scoring

- **Valid time:** a `swimtime` greater than 0 whose status is not DNS, DNF or WDR.
- **DSQ:** the time counts with a **3 s penalty** (Reglement section 2). The LENEX
  `swimtime` does *not* contain the penalty: SPLASH adds it only in its Mehrkampf list,
  which was verified against the CSV exports of Aeschi and Thun. The penalty is applied
  before the best 3 times are chosen.
- **Gesamtzeit of one cup:**
  - Kat. V/IV: the sum of the 3 fastest valid times. At least 3 valid times are needed.
  - Kat. III–I: the sum of all 4 times. All 4 must be valid.
- **Yearly total:** the sum of the Gesamtzeiten from all cups.
- **Eligible for the yearly ranking:** a valid Gesamtzeit at **every** cup of the year.
  While the year is still running, this means every cup loaded so far.
- **Ties:** equal totals get the same rank (1, 2, 2, 4).

## 5. Identifying swimmers across cups

Each file has its own athlete IDs, and the data contains real problems:

- placeholder birthdates (`YYYY-01-01`)
- spelling variants (Timm/Tim, Novák/Novak, Vries/De Vries, Florian/Florian Matteo)
- first and last name swapped
- wrong birthdates or genders
- different club codes for the same club (INT/INTE)
- twins in the same club with the same birthdate (who must never be merged)

### 5.1 Automatic matching
Entries are the same person when **normalized** last name + first name + birth year +
gender are equal. Normalizing means:
- ignoring case
- removing accents (ó → o, é → e, ü → u)
- merging repeated whitespace and hyphens

Two entries of the **same cup** are never merged.

### 5.2 Suspicious entries (to be checked by an operator)
The app lists suspicious pairs of persons that never appear in the same cup:

| Type               | Rule                                                                 |
|--------------------|----------------------------------------------------------------------|
| Names swapped      | first/last name of A = last/first name of B                          |
| Birth year differs | same normalized name, different birth year                           |
| Gender differs     | same normalized name, different gender                               |
| Similar name       | names very similar (typo, accent, extra first name, partial last name), birth year equal or ±1 |
| Same last name and birthdate | same normalized last name, gender and exact birthdate (not a `YYYY-01-01` placeholder), but a different first name (nickname, e.g. Sepp/Josef) |

A person that combines entries with different names, birth years or genders is also
reported as **inconsistent**. This can only happen after manual merges.

For each issue the operator chooses one of:
- **Same person**: merge, and choose the correct name, birth year and gender. These
  values are written to all entries of the merged person.
- **Different persons**: the pair is remembered and never reported again.
- **Edit an entry**: correct the data of a single entry.

### 5.3 Editing single entries
Every entry can be:
- edited: first name, last name, birth year, gender
- joined with another swimmer (only swimmers who did not take part in the same cup are offered)
- detached from its person

### 5.4 Corrections file
All operator decisions are stored in `corrections.json`:
- merges
- separations
- entry overrides
- settings

The app saves them automatically in the browser and can export and import them as a file.
Decisions refer to entries (cup + athleteid), so they stay valid when a new cup file is
added later.

## 6. Web app

- Vue 3 + TypeScript + Vite as a static build with no backend. It can be opened locally
  or put on any web space.
- The files are unzipped and parsed in the browser.
- The UI is in German.
- Views:
  1. **Cups**: load files and list them (place, date, number of swimmers); remove a cup; settings (cups per year).
  2. **Prüfen**: the suspicious entries with their actions (5.2).
  3. **Schwimmer**: all persons with their entries per cup, search, edit, join, detach (5.3).
  4. **Rangliste**: the yearly ranking per category and gender on screen.
  5. **Druck**: printable output through the browser's print function (A4).
- Printed sections, each optional:
  1. The full yearly table per category and gender: rank, name, birth year, club, the
     Gesamtzeit of each cup, the total, and the gap to first place.
  2. The non-eligible swimmers per category: the cups they took part in, or the reason
     (did not take part, withdrawn, too few valid times).
  3. A Jahressieger:innen summary: the winner of each category and gender.
- The club shown is the one from the most recent cup.

## 7. Quality

- Parsing, matching, issue detection and scoring are pure TypeScript modules without UI,
  with unit tests (Vitest).
- An integration test runs against the real files in `results/` when they are present.
