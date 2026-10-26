import type { Gender, Stroke } from './types'
import type { Category, CupOutcome } from './scoring'

/** hundredths → "m:ss.hh" (or "ss.hh" below one minute) */
export function formatTime(hundredths: number): string {
  const h = Math.round(hundredths)
  const minutes = Math.floor(h / 6000)
  const seconds = Math.floor((h % 6000) / 100)
  const hs = h % 100
  const tail = `${String(seconds).padStart(minutes ? 2 : 1, '0')}.${String(hs).padStart(2, '0')}`
  return minutes ? `${minutes}:${tail}` : tail
}

export function formatGap(hundredths: number | null): string {
  if (!hundredths) return ''
  return `+${formatTime(hundredths)}`
}

export function genderLabel(category: Category, gender: Gender): string {
  const youth = category === 'V' || category === 'IV' || category === 'III'
  if (gender === 'F') return youth ? 'Mädchen' : 'Damen'
  return youth ? 'Knaben' : 'Herren'
}

const AGE_LABELS: Record<Category, string> = {
  V: 'bis 10 Jahre',
  IV: '11 + 12 Jahre',
  III: '13 + 14 Jahre',
  II: '15 + 16 Jahre',
  I: '17 Jahre und älter',
}

export function groupTitle(category: Category, gender: Gender): string {
  return `Kategorie ${category} ${genderLabel(category, gender)}`
}

export function ageLabel(category: Category): string {
  return AGE_LABELS[category]
}

export const STROKE_LABELS: Record<Stroke, string> = {
  FLY: 'Delfin',
  BACK: 'Rücken',
  BREAST: 'Brust',
  FREE: 'Freistil',
}

export function outcomeLabel(o: CupOutcome): string {
  switch (o.kind) {
    case 'ok':
      return formatTime(o.total)
    case 'absent':
      return 'nicht gestartet'
    case 'withdrawn':
      return 'abgemeldet'
    case 'exhibition':
      return 'ausser Konkurrenz'
    case 'incomplete':
      return `nur ${o.validCount} gültige Zeit${o.validCount === 1 ? '' : 'en'}`
  }
}

/** Compact wording for print, explained by OUTCOME_LEGEND. */
export function outcomeShortLabel(o: CupOutcome): string {
  switch (o.kind) {
    case 'ok':
      return formatTime(o.total)
    case 'absent':
      return '–'
    case 'withdrawn':
      return 'abg.'
    case 'exhibition':
      return 'aK'
    case 'incomplete':
      return `${o.validCount} Zeit${o.validCount === 1 ? '' : 'en'}`
  }
}

export const OUTCOME_LEGEND = '– nicht gestartet · abg. abgemeldet · aK ausser Konkurrenz · n Zeiten: nur n gültige Zeiten'

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
