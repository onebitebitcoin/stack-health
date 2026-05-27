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
          <p>5~30초 운동 영상을 하루 최대 3회 업로드하면 땀(포인트)을 적립합니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">Lightning 보상</h2>
          <p>매주 적립된 땀은 비트코인(sats)으로 Lightning 주소에 자동 지급됩니다. 설정에서 Lightning 주소를 먼저 등록하세요.</p>
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
          <p>Stack Health(이하 "서비스")는 사용자가 운동 영상을 업로드하고 커뮤니티와 공유하는 플랫폼입니다.</p>
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
          <h2 className="font-semibold text-theme-primary mb-2">제4조 (가상자산 보상 안내)</h2>
          <p className="mb-2">서비스에서 지급되는 비트코인(사토시)은 운동 활동에 대한 보상입니다. 이는 투자 권유, 재산 증식 목적의 금융 서비스가 아닙니다.</p>
          <p className="mb-2">비트코인 보상 수령으로 인해 발생하는 세금 신고 및 납부 의무는 이용자 본인에게 있습니다. 서비스는 세무 조언을 제공하지 않으며 이와 관련한 책임을 지지 않습니다.</p>
          <p className="mb-2">서비스의 리워드 지급 기준(포인트 배율, 활동 종류, 지급량 등)은 운영 상황에 따라 변경될 수 있으며, 변경 시 앱 내 공지를 통해 안내합니다.</p>
          <p className="mb-2">비트코인 보상은 비트코인 네트워크의 채굴 보상 메커니즘에 기반한 인센티브 구조를 참고하여 설계되었습니다. 서비스가 제공하는 보상은 이를 모티프로 한 활동 장려금입니다.</p>
          <p>서비스는 사용자의 비트코인을 보관, 수탁, 교환하지 않습니다. 모든 비트코인 전송은 사용자가 직접 등록한 Lightning 주소로의 단방향 지급이며, 서비스는 가상자산 교환업(VASP)에 해당하지 않습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">제5조 (면책 사항)</h2>
          <p>서비스는 Lightning Network 전송 실패, 지연, 네트워크 장애에 대해 책임지지 않습니다.</p>
        </section>
        <section>
          <h2 className="font-semibold text-theme-primary mb-2">문의</h2>
          <p>onebitebitcoin@gmail.com</p>
        </section>
      </div>
    </div>
  )
}
