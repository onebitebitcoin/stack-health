import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export default function TermsPage() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col h-[100dvh] bg-theme-page overflow-y-auto pb-8">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-theme-border">
        <button onClick={() => navigate(-1)} className="text-theme-muted">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-bold text-theme-primary">이용약관</h1>
      </div>
      <div className="px-4 py-6 space-y-6 text-sm text-theme-muted leading-relaxed">
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제1조 (서비스 개요)</h2>
          <p>운동하고 비트코인 받자(이하 "서비스")는 사용자가 운동 영상을 업로드하고 커뮤니티와 공유하는 플랫폼입니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제2조 (포인트 및 리워드)</h2>
          <p className="mb-2">서비스 내 포인트(점수)는 서비스 내 단위입니다. 포인트는 법정화폐나 가상자산이 아니며, 현금으로 환전되지 않습니다.</p>
          <p>Lightning 전송은 비수탁 방식으로 사용자 본인이 등록한 Lightning 주소로 직접 전송됩니다. 서비스는 사용자의 자산을 보관하거나 수탁하지 않습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제3조 (콘텐츠 정책)</h2>
          <p>업로드 영상은 본인이 직접 촬영한 운동 영상이어야 합니다. 타인의 영상 무단 업로드, 음란물, 폭력적 콘텐츠는 즉시 삭제 및 계정 정지 처리됩니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제4조 (면책 사항)</h2>
          <p>서비스는 Lightning Network 전송 실패, 지연, 네트워크 장애에 대해 책임지지 않습니다. 리워드 지급은 서비스 운영 상황에 따라 변경될 수 있습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">문의</h2>
          <p>onebitebitcoin@gmail.com</p>
        </section>
      </div>
    </div>
  )
}
