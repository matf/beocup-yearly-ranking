import { describe, expect, it } from 'vitest'
import { loadCupFile, parseSwimTime } from '../lenex'
import { FOUR, cup, lenexXml, zipped } from './fixtures'

describe('REQ 2 – input: LENEX files', () => {
  it('reads a zipped .lxf file', async () => {
    const xml = lenexXml('Thun', '2026-08-22', [{ id: '1', first: 'Anna', last: 'Muster', birthdate: '2014-05-01', gender: 'F', results: FOUR }])
    const c = await loadCupFile(await zipped(xml), 'thun.lxf')
    expect(c).toMatchObject({ id: '2026-08-22-thun', city: 'Thun', date: '2026-08-22', year: 2026 })
    expect(c.entries).toHaveLength(1)
  })

  it('reads an unzipped .lef file', async () => {
    const xml = lenexXml('Spiez', '2026-06-06', [])
    const c = await loadCupFile(new TextEncoder().encode(xml), 'spiez.lef')
    expect(c.id).toBe('2026-06-06-spiez')
  })

  it('keeps only the four individual 50m strokes, ignoring relays and 100m', () => {
    const c = cup('Thun', '2026-08-22', [{ id: '1', first: 'Anna', last: 'Muster', birthdate: '2014-05-01', gender: 'F', results: FOUR }])
    expect(Object.keys(c.entries[0].results).sort()).toEqual(['BACK', 'BREAST', 'FLY', 'FREE'])
  })

  it('identifies entries by cup and athleteid', () => {
    const c = cup('Aeschi', '2026-05-17', [{ id: '4711', first: 'Anna', last: 'Muster', birthdate: '2014-05-01', gender: 'F' }])
    expect(c.entries[0].key).toBe('2026-05-17-aeschi:4711')
  })

  it('reads athlete data and club', () => {
    const c = cup('Thun', '2026-08-22', [{ id: '1', first: 'Ophélie', last: 'Bürgi', birthdate: '2013-06-17', gender: 'F', club: 'SCSP' }])
    expect(c.entries[0]).toMatchObject({ firstname: 'Ophélie', lastname: 'Bürgi', birthYear: 2013, gender: 'F', clubCode: 'SCSP', clubName: 'Club SCSP' })
  })

  it('parses swim times into hundredths', () => {
    expect(parseSwimTime('00:00:37.24')).toBe(3724)
    expect(parseSwimTime('00:01:07.18')).toBe(6718)
    expect(parseSwimTime('00:00:00.00')).toBe(0)
    expect(parseSwimTime('NT')).toBe(0)
    expect(parseSwimTime(undefined)).toBe(0)
  })

  it('rejects files without a meet', () => {
    expect(() => cup('X', 'kein-datum', [])).toThrow()
  })
})
