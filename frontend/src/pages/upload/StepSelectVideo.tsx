import type { ChangeEvent, RefObject } from 'react'
import LogoMark from '../../components/LogoMark'

interface Props {
  fileInputRef: RefObject<HTMLInputElement>
  error: string
  setError: (e: string) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export default function StepSelectVideo({ fileInputRef, error, setError, onFileChange }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      <input
        ref={fileInputRef}
        id="video-file-input"
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => { setError(''); onFileChange(e) }}
      />
      <label
        htmlFor="video-file-input"
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 transition-colors cursor-pointer ${
          error ? 'border-red-500 text-red-400' : 'border-theme-border text-theme-muted hover:border-accent hover:text-accent'
        }`}
      >
        <LogoMark size={48} />
        <span>영상을 선택하세요</span>
        <span className="text-xs">5~60초, 최대 50MB</span>
      </label>
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
    </div>
  )
}
