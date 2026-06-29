import { useRef, type ChangeEvent, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Film, X, GripVertical } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type MediaKind = 'video' | 'image'

export interface MediaItem {
  id: string
  kind: MediaKind
  file: File
  previewUrl: string
  durationSec?: number
}

export const MAX_IMAGES = 5
export const IMAGE_CLIP_SECONDS = 3
export const MAX_TOTAL_SECONDS = 60

interface Props {
  fileInputRef: RefObject<HTMLInputElement>
  items: MediaItem[]
  onAddFiles: (files: FileList) => void
  onRemove: (id: string) => void
  onReorder: (items: MediaItem[]) => void
  estimatedSeconds: number
  error: string
  onNext: () => void
}

function SortableCard({ item, onRemove }: { item: MediaItem; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square overflow-hidden rounded-xl bg-theme-surface2 touch-none"
    >
      {item.kind === 'image' ? (
        <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <video src={item.previewUrl} className="h-full w-full object-cover" muted playsInline />
      )}
      {/* drag handle — 길게 눌러 끌어서 순서 변경 */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1 rounded-md bg-black/60 p-1 text-white"
        aria-label="reorder"
      >
        <GripVertical size={14} />
      </button>
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {item.kind === 'video' ? <Film size={11} className="inline" /> : `${IMAGE_CLIP_SECONDS}s`}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
        aria-label="remove"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export default function StepMedia({
  fileInputRef, items, onAddFiles, onRemove, onReorder, estimatedSeconds, error, onNext,
}: Props) {
  const { t } = useTranslation('upload')
  const localInputRef = useRef<HTMLInputElement>(null)
  const inputRef = fileInputRef ?? localInputRef

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const hasVideo = items.some((m) => m.kind === 'video')
  const imageCount = items.filter((m) => m.kind === 'image').length
  const overLimit = estimatedSeconds > MAX_TOTAL_SECONDS
  const canProceed = items.length > 0 && !overLimit

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((m) => m.id === active.id)
    const newIndex = items.findIndex((m) => m.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) onAddFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 gap-4 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold text-theme-primary">{t('media.title')}</p>
        <p className="text-xs text-theme-muted mt-1 leading-relaxed">{t('media.hint')}</p>
      </div>

      <input
        ref={inputRef}
        id="media-file-input"
        type="file"
        accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleChange}
      />

      {items.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <SortableCard key={item.id} item={item} onRemove={onRemove} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <label
        htmlFor="media-file-input"
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
          error ? 'border-red-500 text-red-400' : 'border-theme-border text-theme-muted hover:border-accent hover:text-accent'
        }`}
      >
        <ImagePlus size={32} strokeWidth={1.5} />
        <span className="text-sm">{t('media.addPrompt')}</span>
        <span className="text-xs text-theme-subtle">
          {t('media.counter', { images: imageCount, maxImages: MAX_IMAGES, video: hasVideo ? 1 : 0 })}
        </span>
      </label>

      {items.length > 0 && (
        <p className={`text-xs text-center ${overLimit ? 'text-red-400' : 'text-theme-subtle'}`}>
          {t('media.estimatedLength', { seconds: Math.round(estimatedSeconds) })}
          {overLimit && ` — ${t('media.tooLong', { max: MAX_TOTAL_SECONDS })}`}
        </p>
      )}

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      <div className="mt-auto pb-2">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-40"
        >
          {t('media.next')}
        </button>
      </div>
    </div>
  )
}
