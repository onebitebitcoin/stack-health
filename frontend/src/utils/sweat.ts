export function toSweatL(uploadCount: number): string {
  const l = uploadCount * 0.5
  return l % 1 === 0 ? `${l}L` : `${l.toFixed(1)}L`
}
