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

      <div className="px-4 pt-5 pb-6 space-y-6 text-sm text-theme-muted leading-relaxed">
        <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted">서비스 가이드</p>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">Stack Health</h2>
          <p>5~30초 운동 영상을 하루 최대 3회 업로드해 나의 운동을 기록하고, 꾸준한 운동 습관을 만들어가는 커뮤니티입니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">땀 포인트</h2>
          <p>매일 운동 영상을 업로드하면 땀(포인트)이 적립됩니다. 적립된 포인트는 챌린지 달성, 리더보드 순위 등 서비스 내 활동에 사용됩니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">업로드 정책</h2>
          <p>본인이 직접 촬영한 운동 영상만 업로드 가능합니다. 부적절한 콘텐츠는 즉시 삭제되고 계정이 정지됩니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">포인트 정산</h2>
          <p>업로드 후 24시간이 지나야 포인트가 확정됩니다. 확정 전 영상을 삭제하면 포인트가 회수됩니다.</p>
        </section>
        <div className="h-px bg-theme-border" />
        <p className="text-xs font-semibold uppercase tracking-widest text-theme-muted">이용약관</p>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제1조 (서비스 개요)</h2>
          <p>Stack Health(이하 "서비스")는 사용자가 운동 영상을 업로드하고 커뮤니티와 공유하며 운동 기록을 관리하는 플랫폼입니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제2조 (포인트 및 리워드)</h2>
          <p className="mb-2">서비스 내 포인트(땀)는 운동 활동에 대한 서비스 내부 단위입니다. 포인트는 법정화폐나 가상자산이 아니며, 현금으로 환전되지 않습니다.</p>
          <p>리워드 지급 기준(포인트 배율, 활동 종류, 지급 방식 등)은 운영 상황에 따라 변경될 수 있으며, 변경 시 앱 내 공지를 통해 안내합니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제3조 (콘텐츠 정책)</h2>
          <p>업로드 영상은 본인이 직접 촬영한 운동 영상이어야 합니다. 타인의 영상 무단 업로드, 음란물, 폭력적 콘텐츠는 즉시 삭제 및 계정 정지 처리됩니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제4조 (면책 사항)</h2>
          <p>서비스는 외부 네트워크 장애, 시스템 점검, 불가항력적 사유로 인한 서비스 중단에 대해 책임지지 않습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">문의</h2>
          <p>onebitebitcoin@gmail.com</p>
        </section>
      </div>
    </div>
  )
}
