export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// Returns weekday index 0=Mon...6=Sun for the 1st of the month
export function getFirstDayIndex(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay() // 0=Sun...6=Sat
  return day === 0 ? 6 : day - 1
}

export function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}
