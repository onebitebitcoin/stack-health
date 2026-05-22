import { CalendarDays } from 'lucide-react'

export default function HistoryPage() {
  return (
    <div className="flex flex-col h-[100dvh] bg-theme-page overflow-y-auto pb-20">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-bold text-theme-primary">운동 기록</h1>
        <p className="text-sm text-theme-muted mt-1">날짜별 운동 히스토리</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-16 text-center px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-surface text-accent">
          <CalendarDays size={36} strokeWidth={1.5} />
        </div>
        <div>
          <p className="font-semibold text-theme-primary">운동 캘린더 준비 중</p>
          <p className="mt-1 text-sm text-theme-muted">
            날짜별 운동 영상과 스트릭을 확인할 수 있어요
          </p>
        </div>
      </div>
    </div>
  )
}
