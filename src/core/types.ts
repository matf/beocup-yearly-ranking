export type Gender = 'M' | 'F'

export type Stroke = 'FLY' | 'BACK' | 'BREAST' | 'FREE'

export const STROKES: Stroke[] = ['FLY', 'BACK', 'BREAST', 'FREE']

export interface SwimResult {
  /** swim time in hundredths of a second, 0 if none */
  time: number
  /** LENEX result status, e.g. DSQ, DNS, WDR; empty for a regular result */
  status: string
}

/** One athlete as written in one cup's result file. */
export interface Entry {
  /** `${cupId}:${athleteid}` – stable across reloads of the same file */
  key: string
  cupId: string
  athleteId: string
  firstname: string
  lastname: string
  birthdate: string
  birthYear: number
  gender: Gender
  clubCode: string
  clubName: string
  results: Partial<Record<Stroke, SwimResult>>
}

export interface Cup {
  /** `${date}-${city}` slug */
  id: string
  name: string
  city: string
  date: string
  year: number
  fileName: string
  entries: Entry[]
}

/** Operator edits of a single entry; unset fields keep the file value. */
export interface EntryOverride {
  firstname?: string
  lastname?: string
  birthYear?: number
  gender?: Gender
}

export interface Settings {
  cupsPerYear: number
}

export interface Corrections {
  format: 'beocup-corrections'
  version: 1
  /** pairs of entry keys the operator declared to be the same person */
  merges: [string, string][]
  /** pairs of entry keys the operator declared to be different persons */
  separations: [string, string][]
  overrides: Record<string, EntryOverride>
  settings: Settings
}

/** A swimmer across all cups: a group of entries belonging together. */
export interface Person {
  /** key of the person's first entry (by cup date) – only stable within one computation */
  id: string
  entries: Entry[]
  /** values from the most recent entry */
  firstname: string
  lastname: string
  birthYear: number
  gender: Gender
  /** current name of the club (see clubs.ts) from the most recent entry */
  clubName: string
}
