import { useNavigate } from 'react-router-dom'

interface LoginPromptSheetProps {
  onClose: () => void
}

export default function LoginPromptSheet({ onClose }: LoginPromptSheetProps) {
  const navigate = useNavigate()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-theme-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 h-1 w-10 rounded-full bg-theme-border mx-auto" />
        <h2 className="mt-4 text-center text-lg font-bold text-theme-primary">로그인이 필요해요</h2>
        <p className="mt-1 text-center text-sm text-theme-muted">
          좋아요를 누르려면 로그인하세요
        </p>
        <button
          onClick={() => navigate('/login')}
          className="mt-5 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg"
        >
          로그인 / 회원가입
        </button>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-theme-subtle">
          나중에
        </button>
      </div>
    </div>
  )
}
