/**
 * The six clubs taking part in the BEO-Cup. Result files use varying codes and names for
 * the same club (renamings, typos), so the displayed name is derived from the club code.
 */
export const CLUBS: { name: string; codes: string[] }[] = [
  { name: 'Interlaken Aquatics 1930', codes: ['INT', 'INTE'] },
  { name: 'Schwimmclub Delphin Uetendorf', codes: ['UET'] },
  { name: 'Schulsport Saanenland', codes: ['SAAN'] },
  { name: 'Schwimmclub Frutigen', codes: ['SCFR'] },
  { name: 'Schwimmclub Spiez', codes: ['SCSP'] },
  { name: 'Schwimmklub Thun', codes: ['THUN', 'SKT'] },
]

const BY_CODE = new Map(CLUBS.flatMap((c) => c.codes.map((code) => [code, c.name])))

/** The club's current name; unknown codes keep the name from the file. */
export function clubName(code: string, fileName: string): string {
  return BY_CODE.get(code.trim().toUpperCase()) ?? fileName
}
