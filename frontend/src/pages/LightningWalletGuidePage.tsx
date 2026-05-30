import { Smartphone, Download, CheckCircle, MapPin } from 'lucide-react'

const ANDROID_INSTALL_STEPS = [
  'Google Play 스토어 열기',
  '"Wallet of Satoshi" 검색 후 설치',
  '앱 실행',
]

const IOS_INSTALL_STEPS = [
  'App Store 열기',
  '"Wallet of Satoshi" 검색 후 설치',
  '앱 실행',
]

const FIND_ADDRESS_STEPS = [
  {
    step: '"Receive" 탭',
    desc: '하단 메뉴에서 "Receive"를 누르면 라이트닝 주소와 QR 코드가 나타나요.',
  },
  {
    step: '주소 복사',
    desc: '주소(예: user@walletofsatoshi.com) 옆 복사 버튼을 눌러 클립보드에 저장하세요.',
  },
  {
    step: 'Stack Health에 등록',
    desc: '복사한 주소를 회원가입 화면 또는 설정 → 라이트닝 주소에 붙여넣으면 완료!',
  },
]

function StepList({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden">
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 border-b border-theme-border last:border-b-0"
        >
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 mt-0.5">
            {i === steps.length - 1 ? (
              <CheckCircle size={13} className="text-accent" />
            ) : (
              <span className="text-[11px] font-bold text-accent">{i + 1}</span>
            )}
          </div>
          <p className="text-sm text-theme-primary leading-relaxed">{step}</p>
        </div>
      ))}
    </div>
  )
}

export default function LightningWalletGuidePage() {
  return (
    <div className="min-h-screen bg-theme-page px-5 py-6 max-w-lg mx-auto">
<div className="mb-2">
        <p className="font-bold text-theme-primary text-lg">라이트닝 지갑 만들기</p>
        <p className="text-xs text-theme-muted">Wallet of Satoshi — 무료, 2분이면 완료</p>
      </div>

      {/* ── 설치 ─────────────────────────────── */}
      <p className="text-xs font-semibold uppercase tracking-wider text-theme-subtle mb-3">1단계 — 앱 설치</p>

      <div className="space-y-4 mb-8">
        {/* Android */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={14} className="text-theme-muted" />
            <span className="text-sm font-medium text-theme-primary">Android</span>
            <a
              href="https://play.google.com/store/apps/details?id=com.livingroomofsatoshi.wallet"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-medium text-accent border border-theme-border hover:bg-theme-surface2"
            >
              <Download size={12} />
              Play 스토어
            </a>
          </div>
          <StepList steps={ANDROID_INSTALL_STEPS} />
        </div>

        {/* iOS */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={14} className="text-theme-muted" />
            <span className="text-sm font-medium text-theme-primary">iPhone (iOS)</span>
            <a
              href="https://apps.apple.com/app/wallet-of-satoshi/id1438599608"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 rounded-lg bg-theme-surface px-3 py-1.5 text-xs font-medium text-accent border border-theme-border hover:bg-theme-surface2"
            >
              <Download size={12} />
              App Store
            </a>
          </div>
          <StepList steps={IOS_INSTALL_STEPS} />
        </div>
      </div>

      {/* ── 주소 찾기 ─────────────────────────── */}
      <p className="text-xs font-semibold uppercase tracking-wider text-theme-subtle mb-3">2단계 — 라이트닝 주소 찾기</p>

      <div className="rounded-xl border border-theme-border bg-theme-surface overflow-hidden mb-8">
        {FIND_ADDRESS_STEPS.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-4 py-3.5 border-b border-theme-border last:border-b-0"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 mt-0.5">
              {i === FIND_ADDRESS_STEPS.length - 1 ? (
                <CheckCircle size={14} className="text-accent" />
              ) : (
                <MapPin size={12} className="text-accent" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-theme-primary mb-0.5">{item.step}</p>
              <p className="text-xs text-theme-muted leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 주소 형태 안내 ──────────────────── */}
      <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 px-4 py-3 mb-6">
        <p className="text-xs font-semibold text-yellow-500 mb-1">라이트닝 주소 형태</p>
        <p className="text-xs text-theme-muted leading-relaxed">
          이메일처럼 생겼어요 —{' '}
          <span className="font-mono text-theme-primary">user@walletofsatoshi.com</span>
          <br />
          앱에서 자동으로 발급되고, 지갑 앱이 달라도 형태는 같아요.
        </p>
      </div>

    </div>
  )
}
