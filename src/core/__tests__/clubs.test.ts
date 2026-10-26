import { describe, expect, it } from 'vitest'
import { CLUBS, clubName } from '../clubs'
import { buildPersons } from '../matching'
import { FOUR, corrections, cup } from './fixtures'

describe('REQ 7 – club names', () => {
  it('knows the six BEO-Cup clubs', () => {
    expect(CLUBS).toHaveLength(6)
  })

  it('maps all codes of a club to its current name, ignoring case', () => {
    expect(clubName('INT', 'SK Bödeli Interlaken')).toBe('Interlaken Aquatics 1930')
    expect(clubName('INTE', 'Schwimmklub Bödeli Interlaken')).toBe('Interlaken Aquatics 1930')
    expect(clubName('Scsp', 'Schwimmclup Spiez')).toBe('Schwimmclub Spiez')
    expect(clubName('SKT', 'Schwimmklub Thun')).toBe('Schwimmklub Thun')
  })

  it('keeps the file name for unknown codes', () => {
    expect(clubName('XYZ', 'Gastverein')).toBe('Gastverein')
  })

  it('shows the current club name for a person, whatever name the file used', () => {
    const c = cup('Thun', '2026-08-22', [{ id: '1', first: 'Anna', last: 'Muster', birthdate: '2014-05-01', gender: 'F', club: 'INTE', results: FOUR }])
    expect(buildPersons([c], corrections())[0].clubName).toBe('Interlaken Aquatics 1930')
  })
})
