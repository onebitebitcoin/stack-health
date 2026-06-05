const SRT_TIMESTAMP_RE = /\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/

export function subtitleFileToEditableSrt(raw: string): string {
  return raw.slice(0, 2000)
}

export function captionFromSubtitleText(srt: string): string {
  const lines = srt.split('\n')
  const textLines: string[] = []
  let inCue = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\d+$/.test(trimmed)) { inCue = false; continue }
    if (SRT_TIMESTAMP_RE.test(trimmed)) { inCue = true; continue }
    if (inCue && trimmed) textLines.push(trimmed)
  }
  return textLines.join(' ').slice(0, 140)
}

export function srtToTextLines(srt: string): string[] {
  const lines = srt.split('\n')
  const result: string[] = []
  let inCue = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\d+$/.test(trimmed)) { inCue = false; continue }
    if (SRT_TIMESTAMP_RE.test(trimmed)) { inCue = true; continue }
    if (inCue && trimmed) result.push(trimmed)
    if (inCue && !trimmed) inCue = false
  }
  return result
}

export function applyTextLinesToSrt(srt: string, newLines: string[]): string {
  const lines = srt.split('\n')
  const result: string[] = []
  let inCue = false
  let textIdx = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\d+$/.test(trimmed)) {
      inCue = false
      result.push(line)
    } else if (SRT_TIMESTAMP_RE.test(trimmed)) {
      inCue = true
      result.push(line)
    } else if (inCue && trimmed) {
      result.push(textIdx < newLines.length ? newLines[textIdx] : line)
      textIdx++
    } else {
      if (inCue && !trimmed) inCue = false
      result.push(line)
    }
  }
  return result.join('\n')
}
