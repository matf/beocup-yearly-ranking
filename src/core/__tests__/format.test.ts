import { describe, expect, it } from 'vitest'
import { formatDate, formatGap, formatTime, genderLabel, groupTitle, outcomeLabel, outcomeShortLabel } from '../format'

describe('REQ 6 – output formatting', () => {
  it('formats times like the Meet Manager lists', () => {
    expect(formatTime(3724)).toBe('37.24')
    expect(formatTime(905)).toBe('9.05')
    expect(formatTime(20214)).toBe('3:22.14')
    expect(formatTime(60000)).toBe('10:00.00')
  })

  it('formats the gap to the leader', () => {
    expect(formatGap(0)).toBe('')
    expect(formatGap(150)).toBe('+1.50')
  })

  it('labels Mädchen/Knaben for Kat. V–III and Damen/Herren for Kat. II–I', () => {
    expect(genderLabel('III', 'F')).toBe('Mädchen')
    expect(genderLabel('V', 'M')).toBe('Knaben')
    expect(genderLabel('II', 'F')).toBe('Damen')
    expect(genderLabel('I', 'M')).toBe('Herren')
    expect(groupTitle('IV', 'F')).toBe('Kategorie IV Mädchen')
  })

  it('explains why a cup did not count', () => {
    expect(outcomeLabel({ kind: 'absent' })).toBe('nicht gestartet')
    expect(outcomeLabel({ kind: 'withdrawn' })).toBe('abgemeldet')
    expect(outcomeLabel({ kind: 'exhibition' })).toBe('ausser Konkurrenz')
    expect(outcomeLabel({ kind: 'incomplete', validCount: 1 })).toBe('nur 1 gültige Zeit')
    expect(outcomeLabel({ kind: 'ok', total: 15800, counted: [] })).toBe('2:38.00')
  })

  it('has a compact print wording for every outcome', () => {
    expect(outcomeShortLabel({ kind: 'absent' })).toBe('–')
    expect(outcomeShortLabel({ kind: 'withdrawn' })).toBe('abg.')
    expect(outcomeShortLabel({ kind: 'exhibition' })).toBe('aK')
    expect(outcomeShortLabel({ kind: 'incomplete', validCount: 2 })).toBe('2 Zeiten')
    expect(outcomeShortLabel({ kind: 'ok', total: 15800, counted: [] })).toBe('2:38.00')
  })

  it('formats dates Swiss style', () => {
    expect(formatDate('2026-08-22')).toBe('22.08.2026')
  })
})
