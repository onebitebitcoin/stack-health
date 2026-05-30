import { ChevronRight, Trophy, X, Search, Check, Plus } from 'lucide-react'
import type { Challenge } from '../../api/types'
import client from '../../api/client'

const WORKOUT_TAGS = ['홈트', '러닝', '요가', '웨이트']
const QUICK_TAGS = ['홈트', '러닝', '요가', '웨이트', '일상', '식단', '기타']

interface Props {
  previewUrl: string | null
  selectedTags: string[]
  tagInput: string
  setTagInput: (v: string) => void
  toggleTag: (tag: string) => void
  addTagFromInput: () => void
  hasChallenge: boolean | null
  setHasChallenge: (v: boolean | null) => void
  selectedChallenge: Challenge | null
  selectedChallengeId: number | null
  limitError: string
  setLimitError: (v: string) => void
  clearChallenge: () => void
  onNext: () => void
  openChallengeModal: () => void
  showChallengeModal: boolean
  setShowChallengeModal: (v: boolean) => void
  challengeSearch: string
  setChallengeSearch: (v: string) => void
  displayedChallenges: Challenge[]
  selectChallenge: (c: Challenge) => void
}

export default function StepTagChallenge({
  previewUrl, selectedTags, tagInput, setTagInput, toggleTag, addTagFromInput,
  hasChallenge, setHasChallenge, selectedChallenge, selectedChallengeId,
  limitError, setLimitError, clearChallenge, onNext, openChallengeModal,
  showChallengeModal, setShowChallengeModal, challengeSearch, setChallengeSearch,
  displayedChallenges, selectChallenge,
}: Props) {
  async function handleNext() {
    setLimitError('')
    const hasWorkout = selectedTags.some((t) => WORKOUT_TAGS.includes(t))
    if (hasWorkout) {
      try {
        const res = await client.get<{ data: { reached: boolean } }>('/videos/daily-limit')
        if (res.data.data.reached) {
          setLimitError('오늘 운동 영상 업로드 한도(3개)에 도달했습니다.')
          return
        }
      } catch {
        // 네트워크 오류 시 통과 (서버에서 재검사)
      }
    }
    onNext()
  }

  return (
    <>
      <div className="flex flex-1 flex-col px-6 pt-2 overflow-y-auto">
        {previewUrl && (
          <video src={previewUrl} className="mb-4 h-36 w-full rounded-xl object-cover flex-shrink-0" muted autoPlay loop playsInline />
        )}
        <p className="mb-2 text-sm font-semibold text-theme-primary">카테고리</p>

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedTags.map((tag) => (
              <div key={tag} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg">
                {tag}
                <button onClick={() => toggleTag(tag)} className="flex-shrink-0">
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedTags.includes(tag) ? 'bg-accent/20 text-accent ring-1 ring-accent' : 'bg-theme-surface2 text-theme-muted'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagFromInput() } }}
            placeholder="직접 입력 후 Enter"
            className="flex-1 rounded-xl bg-theme-surface px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none"
          />
          <button
            onClick={addTagFromInput}
            disabled={!tagInput.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-theme-surface text-theme-muted disabled:opacity-40"
          >
            <Plus size={16} />
          </button>
        </div>

        <p className="mb-2 text-sm font-semibold text-theme-primary">챌린지</p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setHasChallenge(false); clearChallenge() }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              hasChallenge === false ? 'bg-accent text-accent-fg' : 'bg-theme-surface text-theme-muted'
            }`}
          >
            없음
          </button>
          <button
            onClick={() => { setHasChallenge(true); openChallengeModal() }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              hasChallenge === true ? 'bg-accent text-accent-fg' : 'bg-theme-surface text-theme-muted'
            }`}
          >
            있음
          </button>
        </div>

        {hasChallenge === true && selectedChallenge && (
          <button
            onClick={openChallengeModal}
            className="flex items-center gap-2 mb-4 rounded-xl bg-accent/10 px-4 py-3 text-left w-full"
          >
            <Trophy size={14} className="text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-accent truncate">{selectedChallenge.title}</p>
              <p className="text-xs text-accent/70 mt-0.5">{selectedChallenge.participant_count}명 참여 · {selectedChallenge.reward_title}</p>
            </div>
            <X
              size={15}
              className="text-accent/60 flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); clearChallenge() }}
            />
          </button>
        )}

        {hasChallenge === true && !selectedChallenge && (
          <button
            onClick={openChallengeModal}
            className="flex items-center justify-between mb-4 rounded-xl bg-theme-surface px-4 py-3 w-full"
          >
            <span className="text-sm text-theme-muted">챌린지를 선택하세요</span>
            <ChevronRight size={16} className="text-theme-muted" />
          </button>
        )}

        {limitError && <p className="mb-2 text-sm text-red-400 flex-shrink-0">{limitError}</p>}

        <button
          onClick={handleNext}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
        >
          다음 <ChevronRight size={18} />
        </button>
      </div>

      {showChallengeModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-theme-page lg:max-w-2xl lg:mx-auto">
          <div className="flex items-center gap-3 px-4 pt-5 pb-3 flex-shrink-0">
            <button
              onClick={() => {
                setShowChallengeModal(false)
                setChallengeSearch('')
                if (!selectedChallenge) setHasChallenge(null)
              }}
              className="text-theme-muted"
            >
              <X size={20} />
            </button>
            <h2 className="text-base font-semibold text-theme-primary flex-1">챌린지 선택</h2>
          </div>

          <div className="px-4 mb-3 flex-shrink-0">
            <div className="flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2.5">
              <Search size={15} className="text-theme-subtle flex-shrink-0" />
              <input
                type="text"
                value={challengeSearch}
                onChange={(e) => setChallengeSearch(e.target.value)}
                placeholder="챌린지 이름 검색..."
                autoFocus
                className="flex-1 bg-transparent text-sm text-theme-primary placeholder-theme-subtle outline-none"
              />
              {challengeSearch && (
                <button onClick={() => setChallengeSearch('')} className="text-theme-muted flex-shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {!challengeSearch && (
              <p className="text-[10px] text-theme-subtle mb-2">진행 중인 챌린지</p>
            )}
            {displayedChallenges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Trophy size={32} className="text-theme-surface2 mb-3" strokeWidth={1} />
                <p className="text-sm text-theme-muted">
                  {challengeSearch ? '검색 결과가 없어요' : '진행 중인 챌린지가 없어요'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedChallenges.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectChallenge(c)}
                    className={`flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                      selectedChallengeId === c.id ? 'bg-accent text-accent-fg' : 'bg-theme-surface text-theme-primary'
                    }`}
                  >
                    {c.image_thumb_url ? (
                      <img src={c.image_thumb_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-theme-surface2 flex items-center justify-center flex-shrink-0">
                        <Trophy size={16} strokeWidth={1.5} className={selectedChallengeId === c.id ? 'text-accent-fg' : 'text-theme-muted'} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.title}</p>
                      <p className={`text-xs mt-0.5 ${selectedChallengeId === c.id ? 'text-accent-fg/70' : 'text-theme-muted'}`}>
                        {c.participant_count}명 참여 · {c.reward_title}
                      </p>
                    </div>
                    {selectedChallengeId === c.id && (
                      <Check size={16} className="text-accent-fg flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
