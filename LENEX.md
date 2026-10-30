# LENEX in the BEO-Cup – what we learned

Practical notes on the LENEX files of the BEO-Cup: what SPLASH Meet Manager and Team Manager
write, how the files differ, and the traps this app has to handle. The findings come from the
real files of 2023–2026 (not in the repository). All names and values in the examples are
invented.

The official format description is the LENEX 3.0 specification by swimrankings.net / SPLASH.
This document covers only what the BEO-Cup files actually contain.

## 1. Container

- **`.lxf`** is a ZIP archive with exactly one **`.lef`** file inside: the LENEX XML, UTF-8.
  Detect the ZIP by its first two bytes `PK` (`0x50 0x4B`).
- A plain `.lef` or `.xml` is the same XML without the ZIP.
- The name of the `.lef` inside the ZIP is arbitrary (often the same as the `.lxf`).
- The root is `<LENEX version="3.0">`. Newer SPLASH versions add `revisiondate` and `created`
  (ISO local time, no time zone, e.g. `2026-10-23T18:32:47`). **Older builds write no `created`.**

## 2. Three kinds of file: Ausschreibung, Meldungen, Resultate

SPLASH uses the same LENEX structure for all three steps of a cup. The files grow from step to
step, but they are written by different programs, and the details differ. Tell them apart by
content, never by file name: file names are free text and often misleading (the archive has
entry files in result folders and announcements named like results).

```
Ausschreibung  ──►  Meldungen (one per club)  ──►  Resultate
Meet Manager        Team Manager                   Meet Manager
(organiser)         (clubs import the              (organiser imports all
                     Ausschreibung)                  Meldungen, runs the cup)
```

### At a glance

| | Ausschreibung (announcement) | Meldungen (entries) | Resultate (results) |
|---|---|---|---|
| Written by | Meet Manager (organiser) | Team Manager (each club) | Meet Manager (organiser) |
| `CONSTRUCTOR name` | `SPLASH Meet Manager 11` | `SPLASH Team Manager 10` | `SPLASH Meet Manager 11` |
| `CONSTRUCTOR registration` | organiser's licence | the club's (or another licence holder's) | organiser's licence |
| Meet details | full: organiser, timing, pool, fees, contacts, point table | reduced: name, city, nation, course, deadline | full, plus `status` on meet, sessions and events |
| Sessions | full: times, meetings, `maxentriesathlete` | number, date, daytime | full, plus `status` |
| Events | all events, Meet Manager `eventid`s | often only some events (e.g. the 10 events without 100/400 m); **Team Manager's own `eventid`s** (`10, 20, 30 …`) | all events, **the same `eventid`s as the Ausschreibung** |
| Age groups | `AGEGROUPS` per event | missing or partial | `AGEGROUPS` with `RANKINGS` (places) |
| Clubs | none | usually one, sometimes two | all clubs of the cup |
| Athletes | none | the club's swimmers | everyone who was entered |
| Per athlete | – | `ENTRIES/ENTRY` with `entrytime`, optional `MEETINFO` (where the time was swum) | `RESULTS/RESULT` with `swimtime`, `status`, `entrytime`, `lane`, `heatid`, `points`, `comment` |
| Relays | none | `RELAY` with `ENTRY`, positions optional | `RELAY` with `RESULT` and `RELAYPOSITIONS` |
| Heats | none | none | `HEATS/HEAT` |
| Other | – | `QUALIFY` (qualification period) | `HEATS`, `RANKINGS` |
| Detect by | no athlete with `ENTRY` or `RESULT` | `ENTRY` elements, no `RESULT` | any `RESULT` element |

Counts for one cup (Thun 2026) as an example: the Ausschreibung has 16 events and no athletes;
one club's Meldung has 10 events, 23 athletes and 93 entries; the Resultate have 16 events, 6
clubs, 97 athletes, 387 results and 98 heats.

### Consequences

- **`eventid` connects files only between Ausschreibung and Resultate.** A Meldung uses Team
  Manager's numbering, so its ids are meaningful only inside that file. Compare events across
  files by `SWIMSTYLE` + `gender` (or `number`).
- A **Meldung shows only what the club entered**: no results, no heats, sometimes not all events.
  Missing events in a Meldung are not missing in the cup.
- Only a Resultate file can become a cup of the yearly ranking. A Meldung or Ausschreibung
  loaded as results would look like a cup where nobody started, so the app rejects them.
- The **Ausschreibung is the template for writing a Meldung** (section 6): its events and ids
  are what the Meet Manager expects back.
- Each file numbers its athletes (`athleteid`) on its own. The same swimmer has different ids
  in a club's Meldung and in the Resultate.

Implementation: `parseLenexFile()` in `src/core/lenex.ts` returns
`{ kind: 'results' | 'entries' | 'announcement' }`.

## 3. Structure

The elements the BEO-Cup files use. Other elements (`POOL`, `FACILITY`, `FEES`,
`POINTTABLE`, `CONTACT`, `HEATS`) occur but are irrelevant here.

```
LENEX                     version, created, revisiondate
├─ CONSTRUCTOR            name (SPLASH product), registration (licence holder: a club), version
└─ MEETS
   └─ MEET                name, city, nation, course (SCM), deadline, organizer …   ← no date!
      ├─ AGEDATE          value (= meet date), type="YEAR"
      ├─ SESSIONS
      │  └─ SESSION       number, date ← the meet date
      │     └─ EVENTS
      │        └─ EVENT   eventid, number, gender (M | F | absent/X), order, round, preveventid
      │           ├─ SWIMSTYLE  distance, relaycount, stroke (FLY | BACK | BREAST | FREE | MEDLEY)
      │           └─ AGEGROUPS / AGEGROUP  agemin, agemax (-1 = open) [→ RANKINGS in results]
      └─ CLUBS
         └─ CLUB          code, name, shortname, nation (SUI), region (RZW)
            ├─ ATHLETES
            │  └─ ATHLETE athleteid, lastname, firstname, gender (M | F), birthdate, nation, license
            │     ├─ ENTRIES / ENTRY    eventid, entrytime [→ MEETINFO]        (entry files)
            │     └─ RESULTS / RESULT   eventid, swimtime, status, entrytime,  (result files)
            │                           resultid, heatid, lane, points, comment
            └─ RELAYS
               └─ RELAY   number, gender (X), agemin/agemax …
                  └─ ENTRIES/ENTRY or RESULTS/RESULT → RELAYPOSITIONS/RELAYPOSITION number, athleteid
```

### Dates and age

- **The meet date is in `SESSION date`** (and `AGEDATE value`). `MEET` itself has no date,
  only the entry `deadline`.
- `AGEDATE type="YEAR"`: the age is the meet year minus the birth year, so the category stays
  the same for the whole year.
- `birthdate` is `YYYY-MM-DD`. **`YYYY-01-01` is a common placeholder** for "only the year is
  known": never treat it as a real birthdate, and never use the full date for matching.

### Times

- `swimtime` and `entrytime` are `HH:MM:SS.hh`, e.g. `00:00:37.42`, `00:01:05.30`.
- `00:00:00.00` means no time: a result with DNS/WDR, or an entry without entry time
  (`MEETINFO qualificationtime="NT"`).
- `entrycourse="LCM"` on a result: the entry time was swum in a 50 m pool.

### Events

- **Identify events by `SWIMSTYLE` (distance, relaycount, stroke) plus `EVENT gender`**, never
  by `eventid` or `number` alone.
- The BEO-Cup programme, by event number:

  | Number | Event |
  |---|---|
  | 1–8 | 50 m Fly, Back, Breast, Free; boys (odd) and girls (even) |
  | 9, 10 | 4 × 50 m relays Free and Medley, mixed (`gender` absent or `X`) |
  | 11–15 | 100 m Free (five events, no gender) |
  | 16 | 400 m Free |

  Only events 1–8 count for the Mehrkampf. The swimming order can differ from the number
  (`order` attribute): in Gstaad 2026, event 5 (Breast) has `order="8"`.
- **`eventid` depends on who wrote the file:**
  - Announcement and results of the same cup share the Meet Manager ids (e.g. `1058`, `1064` …).
  - **Team Manager renumbers** in its exports: `10, 20, 30 …`. An entry file's ids never match
    the announcement's.
  - So `eventid` only links `ENTRY`/`RESULT` to `EVENT` *within one file*.

### Results and status

- `RESULT status` in result files:

  | Status | Meaning | `swimtime` | For the BEO-Cup |
  |---|---|---|---|
  | (none) | regular result | the time | counts |
  | `DSQ` | disqualified | **the swum time, without penalty** | time + 3 s (Reglement §2) |
  | `DNS` | did not start | `00:00:00.00` | invalid |
  | `WDR` | withdrawn | `00:00:00.00` | invalid |
  | `DNF` | did not finish | – | invalid |
  | `EXH` | exhibition, "ausser Konkurrenz" (aK) | the time | the cup does not count |

- The 3 s DSQ penalty is **not** in the LENEX `swimtime`. SPLASH adds it only in its printed
  Mehrkampf list. `comment` on a DSQ result holds the reason.
- `EXH` also occurs on relay results.
- `status="OFFICIAL"` appears on `EVENT`/`HEAT`, not on results.
- An athlete may lack a `RESULT` for an event they were not entered in.
- `RANKINGS/RANKING` under `AGEGROUP` holds SPLASH's places per age group (`resultid`, `place`).
  This app recomputes everything and does not read them.

## 4. Clubs and athletes

- `CLUB code` is the key the files use, but it is not stable over the years:
  - Interlaken Aquatics 1930: `INT`, `INTE` (old), `INTA` (2026 entry files)
  - Schwimmklub Thun: `THUN`, `SKT` (old)
  - `BEO` = Startgemeinschaft Berner Oberland. A few swimmers of the clubs are registered
    under it, and an organiser used it for entries typed in by hand.
  - Club `name` contains old names and typos. The app maps codes to the official names
    (`src/core/clubs.ts`).
- **`athleteid` is only unique within one file.** Each file numbers its athletes on its own,
  so a swimmer has a different id at every cup.
- Names vary between files: typos, accents, swapped first and last name, extra first names,
  double last names. The gender or the birth year is occasionally wrong. See REQUIREMENTS §6.
- Twins share the club and birthdate: two athletes of the same file are never the same person.

## 5. Entry files (Team Manager)

- Usually one club per file, sometimes two (e.g. `BEO` and a club).
- `ENTRY entrytime` is the entry time. An optional child `MEETINFO` says where it was swum
  (`date`, `city`, `name`, `course`) or holds `qualificationtime="NT"`.
- Clubs send corrected files ("…_2.lxf", "UET II", "UET III"): **per cup and club, the newest
  file replaces the older ones**, by `LENEX created`, then by load order.
- The meet part repeats the announcement (name, city, sessions, events), but with Team Manager's
  own event ids (see 3).
- Entry files also contain the relay entries (`RELAYS/RELAY/ENTRIES/ENTRY` with
  `RELAYPOSITIONS`), and entries for the 100 m and 400 m events.

## 6. Writing an entry file that Meet Manager imports

`src/core/lenexWriter.ts` writes entry files for clubs without Team Manager (Gstaad's Word form,
REQUIREMENTS §9.4). The **SPLASH Meet Manager import was verified in October 2026** with a
file of this shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<LENEX version="3.0" created="2026-10-30T19:40:00">
  <CONSTRUCTOR name="BEO-Cup Jahreswertung" registration="Schulsport Saanenland" version="1">
    <CONTACT name="BEO-Cup Jahreswertung" />
  </CONSTRUCTOR>
  <MEETS>
    <MEET name="BEO Cup Gstaad 2026" city="Gstaad" nation="SUI" course="SCM">
      <AGEDATE value="2026-10-31" type="YEAR" />
      <SESSIONS>
        <SESSION number="1" date="2026-10-31">
          <EVENTS>
            <!-- all events of the announcement, with ITS eventid and number -->
            <EVENT eventid="1058" number="1" gender="M" preveventid="-1">
              <SWIMSTYLE distance="50" relaycount="1" stroke="FLY" />
            </EVENT>
            …
          </EVENTS>
        </SESSION>
      </SESSIONS>
      <CLUBS>
        <CLUB name="Schulsport Saanenland" code="SAAN" nation="SUI" region="RZW">
          <ATHLETES>
            <ATHLETE athleteid="1" lastname="Zaugglin" firstname="Fiorella" gender="F" birthdate="2014-01-01">
              <ENTRIES>
                <ENTRY eventid="1064" entrytime="00:00:41.50" />
              </ENTRIES>
            </ATHLETE>
          </ATHLETES>
        </CLUB>
      </CLUBS>
    </MEET>
  </MEETS>
</LENEX>
```

Lessons:
- Take the meet and **all events from the cup's announcement**, keeping its `eventid` and
  `number`. The import then assigns the entries correctly. Team Manager uses other ids, so the
  import evidently does not need them to match its own export.
- The entry's event must match the swimmer's gender: girls' entries go to the `F` event of the
  stroke.
- `athleteid` only needs to be unique in the file.
- Minimal headers are enough. `CONSTRUCTOR` with a `CONTACT`, the `MEET` with name/city/nation/
  course, `AGEDATE` and one `SESSION` with the date.
- Escape `& " < >` in attribute values.
- Zip the XML as `<name>.lef` into `<name>.lxf`.

## 7. Related SPLASH outputs (not LENEX)

Used by the real-data test to verify the app's calculations:

- **CSV/TXT export of the Mehrkampf** (Meet Manager): tab-separated, Latin-1, header starting
  `NAME\tBIRTHDATE`; the name is `LAST, First`, the date `d.m.yyyy`; the Mehrkampf total follows
  the `Kategorie …` column. Swimmers without a valid Mehrkampf have no total.
- **Rangliste PDFs:** the Mehrkampf total is printed with the number of strokes it contains
  appended (`2:33.863` = 2:33.86 from 3 strokes). Times in `( )` do not count, `*` marks a DSQ,
  tied swimmers after the first have no rank number. Preliminary lists printed on the day may
  be superseded by a later one.

## 8. Parsing tips

- `fast-xml-parser` with `ignoreAttributes: false`, `attributeNamePrefix: ''`,
  `parseAttributeValue: false` (keep `"09"`, ids and times as strings) and `isArray` for every
  repeating element (`MEET, SESSION, EVENT, CLUB, ATHLETE, RESULT, ENTRY, RELAY, AGEGROUP …`).
  Without `isArray`, a single child becomes an object instead of an array.
- Trim names: some files have trailing spaces.
- Athlete `gender` is `M`/`F`; `X` occurs only on relays and mixed events.
- Missing attributes are common (`created`, `nation`, `license`, `shortname`), so treat
  everything as optional and validate where used.
