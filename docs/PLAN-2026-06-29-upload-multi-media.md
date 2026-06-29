# 업로드 플로우 재구성 계획서 — 다중 이미지/영상 + 자막 단계 개편

> 작성일: 2026-06-29
> 대상: 영상 업로드 3단계 재구성 (다중 이미지·영상 / 음성·자막 / 챌린지·메타)
> 핵심 전제: **기존 단일 영상 업로드 경로는 절대 손상하지 않는다.** 새 멀티 경로를 별도로 신설하고 프론트만 새 플로우로 전환한다.

---

## 1. 목표 요약

업로드를 현재 4단계에서 **3단계**로 재구성한다.

| 새 단계 | 이름 | 내용 |
|---|---|---|
| 1 | 미디어 업로드 | 영상 1개 또는 이미지 여러 장(최대 5장)을 **순서대로** 업로드. 이미지는 장당 3초, 영상은 원본 길이로 이어붙임. (기존 1단계 + 4단계 증거사진을 통합) |
| 2 | 음성·자막 | 영상 음성 추출(Whisper) / 직접 녹음 / **텍스트 후기 직접 입력** 중 하나로 자막 생성 + 자막 스타일(크기/위치/언어) |
| 3 | 챌린지·메타 | 운동 카테고리(포인트 산정) + 챌린지 선택 + 운동 시간 + 캡션 + 업로드 |

### 인터뷰로 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 미디어 구성 | **영상 최대 1개 + 이미지 여러 장** (영상 여러 개는 미지원) |
| 이미지 최대 장수 | **5장** |
| 항목 순서 | 추가한 순서 고정 + **드래그로 재정렬 가능** (영상이 앞/중간/뒤 어디든 가능) |
| 최종 영상 길이 | **최소 3초 ~ 최대 60초** (이미지만 1장이면 3초 허용) |
| 카테고리 위치 | **3단계(챌린지+운동시간)에 함께 배치** |
| 텍스트 후기 자막화 | **글자 수 기반 자동 분할 후 영상 전체 길이에 균등 분배** |
| 오디오 처리 | **기존 방식 계승** (녹음 시 원본 음소거+녹음을 전체에 입힘 / 미선택 시 영상 원본 유지 / 이미지 구간은 무음) |
| 구현 전략 | **기존 경로 유지 + 새 멀티 경로 신설** |

---

## 2. 현재 구조 (AS-IS)

### 2.1 프론트엔드 — `frontend/src/pages/UploadPage.tsx` (+ `upload/Step*.tsx`)

- `STEPS_KEYS = ['selectVideo', 'tagChallenge', 'record', 'caption']`
- **Step 0 `StepSelectVideo`**: 영상 1개 선택. `accept="video/mp4,video/quicktime"`. 클라이언트가 `loadedmetadata`로 10~60초 검증.
- **Step 1 `StepTagChallenge`**: 메인/서브 카테고리(`MAIN_CATEGORIES = ['가벼운 활동', '땀 흘리는 운동']`) + 챌린지 선택.
- **Step 2 `StepRecord`**: 진입 시 자동으로 `extractSubtitles('video')` 호출(Whisper) → 녹음/자막 편집 + `muteOriginalAudio` 토글.
- **Step 3 `StepCaption`**: 운동시간(`workout_start/end`), 자막 언어/스타일, 캡션(140자), **증거 사진(proof_image)**, 업로드 버튼.
- 업로드: `handleUpload()` → `POST /videos/upload-pipeline` (multipart) → `job_id` → `GET /videos/upload-job/{job_id}` 폴링.

### 2.2 백엔드 — `backend/app/routes/videos.py`

- `POST /videos/upload-pipeline` (L836): `file`(영상 필수) + `audio` + `proof_image` + `subtitle_srt` + 메타. `duration_sec` 10~60 강제. 임시파일 spool 후 `background_tasks`로 `_r2_upload_and_enqueue` 실행.
- `_r2_upload_and_enqueue` (L736): R2 업로드 → `enqueue_full_upload_pipeline()`.
- `POST /videos/transcribe-subtitles` (L615): 자막 추출 잡 등록.
- `GET /videos/subtitle-job/{job_id}` (L652), `GET /videos/upload-job/{job_id}` (L928): 폴링.
- `POST /videos/upload-proof` (L558): 증거 이미지 단독 업로드.

### 2.3 큐 — `backend/app/services/job_queue.py`

- `enqueue_full_upload_pipeline(...)` → payload `job_type="full-pipeline"`.
- 단일 큐 `queue:merge-jobs:{env}`, job 상태는 Redis hash `job:{id}`.

### 2.4 워커 — `worker/worker.py` + `worker/tasks/`

- `_process_job`: `job_type`으로 분기 (`full-pipeline` / `subtitle-extract` / `proof-merge` / `merge`).
- `run_full_pipeline` (`tasks/full_pipeline.py`): **audio_merge → image_merge → compress → thumbnail → subtitle(burn-in) → db_save** 순.
  - `_audio_merge`: 영상+녹음 오디오 머지.
  - `run_image_merge` (`tasks/image_merge.py`): **이미지 1장을 3초 클립으로 인코딩 후 영상 뒤에 concat** (filter_complex, h.264 재인코딩). ← **이미 핵심 로직 보유.**
  - `burn_user_srt` (`tasks/subtitle.py`): SRT를 ASS로 변환해 burn-in. `FONT_SIZE_MAP / ALIGNMENT_MAP / MARGIN_V_MAP`.
- DB 저장: `Video` + `Post` 생성, `points_for_tags(tags)`로 포인트(`tags[0]`이 `'가벼운 활동'`이면 낮게, 아니면 높게), `increment_challenge_upload`.

### 2.5 DB 모델

- `Video`: `r2_key, cdn_url, file_hash, duration_sec, subtitle_*`, `original_video_r2_key, original_audio_r2_key`.
- `Post`: `video_id, caption, tags(JSON), workout_start/end, proof_image_url, thumbnail_url, challenge_id, share_token`.

---

## 3. 새 구조 (TO-BE)

### 3.1 데이터 흐름 (신규 멀티 경로)

```
[프론트 새 3단계]
  1단계: 미디어 N개 (영상≤1 + 이미지≤5), 순서 배열
  2단계: 자막 소스 = video|record|text, subtitle_srt 또는 raw text
  3단계: 카테고리 tags + challenge_id + workout + caption
        │
        ▼  multipart POST /videos/upload-multi
[백엔드]  files[] + items_meta(JSON: 순서/타입) + audio + subtitle_srt|subtitle_text + 메타
        │  spool → background → R2 업로드 → enqueue (job_type="multi-pipeline")
        ▼
[워커] run_multi_pipeline:
  1) compose: items 순서대로 concat (이미지=3초 클립, 영상=원본) → 단일 mp4
  2) audio_merge: 녹음 있으면 합쳐진 영상 전체에 입힘 (기존 _audio_merge 재사용)
  3) compress / thumbnail (기존 함수 재사용)
  4) subtitle:
       - subtitle_srt 있으면 그대로 burn (기존)
       - subtitle_text(텍스트 후기)면 → 최종 영상 길이 측정 후 SRT 생성 → burn
  5) db_save: 기존과 동일 (Video + Post + 포인트 + 챌린지)
```

### 3.2 핵심 설계 원칙 — 무영향 보장

1. **기존 `full-pipeline` 코드는 일절 수정하지 않는다.** `run_full_pipeline`, `enqueue_full_upload_pipeline`, `/videos/upload-pipeline` 그대로 유지.
2. **재사용은 "호출"로만** 한다. `_audio_merge / _compress_video / _extract_thumbnail / burn_user_srt`는 시그니처 변경 없이 그대로 import해서 새 파이프라인에서 호출. (현재 `full_pipeline.py` 내부 `_`함수들이라, 공용 추출이 필요하면 신규 모듈 `tasks/common.py`로 **복사가 아닌 이동 + 기존 파일에서 re-import**하여 단일 출처 유지 — 단 이동 시 기존 경로 회귀 테스트 필수. 리스크 줄이려면 1차 구현은 `from tasks.full_pipeline import _audio_merge, _compress_video, _extract_thumbnail`로 직접 재사용.)
3. **프론트는 새 플로우로 전환**하되, 롤백 가능하도록 기존 `Step*.tsx`는 삭제하지 않고 새 컴포넌트를 추가한다 (예: `upload/StepMedia.tsx`, `StepSubtitle.tsx`, `StepMeta.tsx`).
4. **DB 스키마 변경 없음**을 1차 목표로 한다. 최종 산출물은 합쳐진 영상 1개 → 기존 `Video`/`Post` 구조로 충분. `proof_image_url`은 첫 이미지 CDN URL을 넣거나 null(아래 §4.4 결정).

---

## 4. 변경 상세

### 4.1 프론트엔드

#### 신규 컴포넌트
| 파일 | 역할 |
|---|---|
| `upload/StepMedia.tsx` | 영상/이미지 멀티 선택, 썸네일 리스트, **드래그 재정렬**, 장수/길이 검증, 항목 삭제 |
| `upload/StepSubtitle.tsx` | 자막 소스 3택1(영상음성/녹음/텍스트입력) + 자막 편집 + 스타일(크기/위치/언어). 기존 `StepRecord` + `StepCaption`의 자막 부분 통합 |
| `upload/StepMeta.tsx` | 카테고리(`StepTagChallenge`에서 이동) + 챌린지 + 운동시간 + 캡션 + 업로드 버튼 |

#### `UploadPage.tsx` 변경
- `STEPS_KEYS = ['media', 'subtitle', 'meta']`로 교체.
- 상태 추가:
  - `mediaItems: MediaItem[]` — `{ id, kind: 'video'|'image', file, previewUrl }[]` (순서 = 배열 인덱스).
  - `subtitleSource: 'video' | 'record' | 'text'`
  - `subtitleRawText: string` (텍스트 후기 입력)
- 검증 로직 (클라이언트 1차, 서버 2차):
  - 영상 ≤ 1개, 이미지 ≤ 5장.
  - 예상 총 길이 = Σ(이미지 3초) + 영상 길이. 3초 미만 차단 불필요(이미지 1장=3초 보장), **60초 초과 시 차단** + 안내 메시지.
  - 영상 길이는 기존처럼 `loadedmetadata`로 측정(iOS Infinity 대비 서버 재검증).
- 업로드 호출: `POST /videos/upload-multi` (multipart). `mediaItems` 순서를 `items_meta` JSON으로 전송 + 파일들은 `files`로 순서대로 append.
- 자막 처리:
  - `subtitleSource==='video'`: 기존 `extractSubtitles('video')` 재사용(첫/유일 영상 대상). 영상이 없으면 이 옵션 비활성.
  - `subtitleSource==='record'`: 기존 녹음 로직 재사용 → `extractSubtitles('audio')`.
  - `subtitleSource==='text'`: 서버로 `subtitle_text`(raw) 전송. SRT 변환은 워커가 최종 길이 측정 후 수행.
- 폴링: 기존 `upload-job/{job_id}` 재사용 (job 상태 구조 동일).
- **드래그 재정렬**: 외부 라이브러리 없이 HTML5 DnD 또는 위/아래 이동 버튼으로 1차 구현(의존성 추가 최소화). 모바일 터치 고려 시 `@dnd-kit/core` 검토(별도 결정).

#### i18n
- `frontend/src/i18n/locales/{ko,en}/upload.json`에 새 단계 키 추가 (`steps.media/subtitle/meta`, 미디어 안내/에러, 자막 소스 라벨, 텍스트 입력 placeholder 등).

### 4.2 백엔드

#### 신규 엔드포인트 `POST /videos/upload-multi` (`videos.py`)
입력(multipart):
- `files: list[UploadFile]` — 영상/이미지 혼합, **클라이언트 전송 순서 보존**.
- `items_meta: str` (JSON) — `[{ "kind": "image"|"video", "index": 0 }, ...]` 파일 순서·타입 매핑.
- `audio: UploadFile | None`, `audio_duration_sec`
- `subtitle_srt: str | None` (영상음성/녹음 결과) **또는** `subtitle_text: str | None` (텍스트 후기 raw)
- `subtitle_size/position/language`, `mute_video`
- `caption`, `tags`(JSON), `challenge_id`, `workout_start/end`
- 헤더 `x-client-timezone`

검증:
- 영상 ≤ 1, 이미지 ≤ 5, files 총 ≥ 1.
- content_type 화이트리스트 (`r2_service.ALLOWED_CONTENT_TYPES` + `ALLOWED_IMAGE_CONTENT_TYPES`).
- 일일 한도 `get_daily_upload_count >= DAILY_MAX_UPLOADS` 재사용.
- **duration_sec 검증 변경**: 멀티 경로는 서버가 길이를 미리 알 수 없으므로(이미지 장수×3 + 영상), 클라이언트가 보낸 예상치 또는 워커 측정값을 신뢰. 1차 게이트는 "이미지 장수 + 영상 유무"로 두고, **최종 60초 초과 컷은 워커 compose 직후** 수행(초과 시 job 실패 처리).

처리:
- 각 파일 `_spool_upload_to_temp`로 임시 저장.
- `background_tasks`로 신규 `_r2_upload_and_enqueue_multi` 실행 → R2 업로드(순서 유지) → `enqueue_multi_pipeline()`.

#### `job_queue.py`
- 신규 `enqueue_multi_pipeline(items: list[dict], ...)` — payload `job_type="multi-pipeline"`, `items=[{kind, r2_key}]` 순서 배열 + 나머지 메타(audio/subtitle/caption/tags/...). 기존 `enqueue_full_upload_pipeline`은 미변경.

### 4.3 워커

#### `worker.py`
- `_process_job` 분기에 `elif job_type == "multi-pipeline": result = run_multi_pipeline(job, status_callback=_step_cb)` 추가. (기존 분기 유지)

#### 신규 `tasks/compose.py` — `compose_items(r2, items) -> (composed_r2_key, total_duration)`
- items 순서대로:
  - `image`: `image_merge.py`의 이미지→3초 클립 인코딩 로직을 일반화해 사용.
  - `video`: 원본 그대로.
- **해상도/fps 정규화**: 기준을 영상이 있으면 그 영상 해상도/fps, 없으면 첫 이미지 기준(예: 720×1280, 30fps)로 통일.
- 모든 클립을 동일 코덱/해상도/fps/SAR/pix_fmt로 맞춘 뒤 `concat` (filter_complex, 기존 image_merge와 동일 안전 패턴 — 코덱 불일치 검은 화면 방지).
- 오디오 트랙: 영상 구간은 원본(또는 mute), 이미지 구간은 `anullsrc` 무음. concat 시 `a=1`로 통일(영상에 오디오 없으면 전체 무음 처리).
- 반환: 합쳐진 mp4의 r2_key + ffprobe 측정 총 길이.
- **`image_merge.py`는 기존 proof-merge 경로가 계속 쓰므로 그대로 두고**, 공통 ffmpeg 헬퍼만 `compose.py`로 추출하거나 1차에는 독립 구현(중복 허용, 회귀 0 우선).

#### 신규 `tasks/full_pipeline_multi.py` — `run_multi_pipeline(job, status_callback)`
순서:
1. `status_callback("compose")` → `compose_items()` → 합쳐진 영상 + total_duration.
2. **60초 초과 검증**: total_duration > 60이면 `raise RuntimeError("최종 영상이 60초를 초과합니다")` (job failed).
3. `status_callback("audio_merge")` → 녹음 있으면 `_audio_merge` 재사용.
4. `status_callback("compress")` → `_compress_video` 재사용.
5. `status_callback("thumbnail")` → `_extract_thumbnail` 재사용.
6. `status_callback("subtitle")`:
   - `subtitle_srt_r2_key` 있으면 `burn_user_srt` 그대로.
   - `subtitle_text` 있으면 → `build_srt_from_text(text, total_duration)`로 SRT 생성 → R2 저장 → `burn_user_srt`.
7. `status_callback("db_save")` → 기존 `run_full_pipeline`의 DB 저장부와 동일 로직 (Video+Post+포인트+챌린지). **이 DB 저장 블록은 `full_pipeline.py`에서 공용 함수 `persist_upload(...)`로 추출**해 두 파이프라인이 공유(중복/드리프트 방지). 추출 시 기존 full-pipeline 회귀 테스트로 검증.
- `db_save`의 `duration_sec`는 measured total_duration을 `min(60, max(3, ...))`로 저장 (현재는 `max(5,...)` → 멀티는 최소 3 허용).

#### 신규 `build_srt_from_text(text: str, total_sec: float) -> str` (worker, 예: `tasks/subtitle.py`에 추가)
- 글자 수 기반 분할: 줄바꿈/문장부호 우선 분할 → 각 조각 최대 N자(예: 한글 18자/영문 36자)로 재분할.
- 분할된 조각 수 M, 각 조각에 `total_sec / M`씩 균등 배정해 `00:00:00,000 --> ...` SRT 생성.
- `sanitize_srt`(backend `subtitles.py`)와 동일한 정제 규칙 적용(특수문자/길이 제한).
- 빈 텍스트면 자막 skip.

### 4.4 확정/기본값 처리
- **`proof_image_url`**: proof 개념 **폐기**. 멀티에서 항상 **null**. 이미지는 일반 미디어로 합쳐진 영상에 포함된다. (별도 증거사진 입력 UI 없음)
- **`tags`**: 카테고리가 3단계로 이동해도 `tags=[mainCategory, subCategory]` JSON 형식 그대로 유지 → `points_for_tags` 무변경.
- **`file_hash`**: 현재 `file_hash=r2_key`로 사용 중 → 멀티도 합쳐진 영상 r2_key 사용(동일 관례).

---

## 5. 구현 Phase 분할 (PROGRESS.md로 추적)

> 3개 이상 Phase → 대규모 작업 규칙 적용 (각 Phase 완료 시 린트/테스트 → 체크포인트 커밋 → /clear).

| Phase | 범위 | 산출물 | 테스트 게이트 |
|---|---|---|---|
| **P1. 워커 compose 코어** | `tasks/compose.py` + `build_srt_from_text` + 단위 테스트 | 이미지/영상 혼합 concat이 로컬 ffmpeg로 동작 | `worker/tasks/test_*` 신규, 기존 워커 테스트 GREEN |
| **P2. 워커 멀티 파이프라인** | `run_multi_pipeline`, `persist_upload` 공용 추출, `worker.py` 분기 | multi-pipeline job 처리 end-to-end(로컬) | 기존 `full-pipeline` 회귀 테스트 GREEN + 멀티 신규 테스트 |
| **P3. 백엔드 엔드포인트** | `/videos/upload-multi`, `enqueue_multi_pipeline`, 검증 | API 계약 + pytest | `backend/tests/test_videos*` 신규, 기존 전체 GREEN |
| **P4. 프론트 새 3단계** | `StepMedia/StepSubtitle/StepMeta`, `UploadPage` 전환, i18n | 새 플로우 UI | Vitest 단위(검증 로직/순서/길이), 빌드 GREEN |
| **P5. 통합·E2E·정리** | Playwright 시나리오, 문서/INDEX 갱신, VERSION bump | 통합 검증 | E2E GREEN, 수동 디바이스 확인 |

각 Phase 모델 라우팅(MANDATORY 규칙):
- P1/P2(워커, 복잡한 ffmpeg/디버깅, 6파일↑) → **HIGH/opus** (`executor-high`)
- P3(API 2~5파일) → **MEDIUM/sonnet** (`executor`)
- P4(프론트 다파일) → **MEDIUM~HIGH** (드래그/상태 복잡 시 opus)
- P5(테스트/문서) → **MEDIUM**

---

## 6. 테스트 시나리오

### 6.1 단위 테스트

**워커 (`worker/tasks/test_compose.py` 신규, pytest)**
- 이미지 1장 → 3초 영상 생성, 총 길이 ≈ 3.0초.
- 이미지 5장 → ≈ 15초, 프레임/해상도 정규화 확인.
- 이미지 + 영상(앞) → 3초 + 영상길이, 순서 보존(첫 프레임=이미지).
- 영상 + 이미지(뒤) → 영상길이 + 3초.
- 이미지 2장 + 영상 1장(중간) → 순서 3구간 concat.
- 영상에 오디오 있음/없음 두 경우 모두 검은 화면/오디오 끊김 없음.
- 60초 초과 입력 → compose 후 길이 검증에서 실패 유도.

**`build_srt_from_text`**
- 짧은 텍스트(1조각) → 단일 cue, 0초~total.
- 긴 텍스트 → N조각 균등 분배, 시간 겹침/공백 없음, 마지막 cue 종료 == total.
- 줄바꿈/문장부호 분할 우선.
- 빈/공백 텍스트 → 빈 SRT(자막 skip).
- 특수문자/초장문 → `sanitize_srt` 규칙 통과.

**백엔드 (`backend/tests/test_videos_multi.py` 신규)**
- 영상 2개 전송 → 400 (영상 ≤ 1).
- 이미지 6장 → 400 (≤ 5).
- files 0개 → 400.
- 일일 한도 초과 → 429.
- 정상 (이미지3+영상1) → 200 + `job_id`, 큐에 `multi-pipeline` payload + items 순서 일치.
- `subtitle_text`와 `subtitle_srt` 동시 전송 시 우선순위 규칙 검증.

**프론트 (`upload/StepMedia.test.tsx` 등 Vitest)**
- 영상 1개 선택 후 추가 영상 차단.
- 이미지 6장째 차단.
- 예상 총 길이 60초 초과 시 업로드 비활성 + 메시지.
- 드래그/이동으로 순서 변경 → 전송 `items_meta` 순서 반영.
- 자막 소스 토글: 영상 없으면 'video' 옵션 비활성.

### 6.2 통합 테스트
- 백엔드 + Redis + 워커 로컬 기동 → `/videos/upload-multi` → 폴링 `completed` → `Post` 생성, `duration_sec` 측정값, 포인트 = `points_for_tags(tags)` 일치.
- 텍스트 후기 경로: `subtitle_text` 전송 → 결과 영상에 자막 burn-in 확인(`subtitle_status=completed`).

### 6.3 회귀 테스트 (무영향 검증 — 필수)
- **기존 `/videos/upload-pipeline` 단일 영상 업로드가 코드/동작 변화 없이 통과**: `backend/tests` 전체 GREEN.
- `run_full_pipeline` 기존 테스트(`worker/tasks/test_pipeline_fixes.py`) GREEN.
- proof-merge(`/videos/merge-proof`), subtitle-extract 경로 정상.
- `persist_upload`/공용 헬퍼 추출 시: 추출 전/후 기존 테스트 diff 없음 확인.

### 6.4 E2E (Playwright, `frontend/e2e/`)
- 시나리오 A: 이미지 3장 업로드 → 자막 텍스트 입력 → 카테고리/챌린지/시간 → 업로드 → 완료 화면 포인트 노출.
- 시나리오 B: 영상 1개 → 영상 음성 자막 추출 → 업로드.
- 시나리오 C: 이미지 1장만 → 3초 영상 생성 완료.
- iOS Safari 동작 수동 확인(파일 선택/드래그/세로 영상 회전).

### 6.5 테스트 결과 출력 (워크플로 규칙)
각 Phase 종료 시 Frontend/Backend Lint·Test 결과 테이블 출력 → FAIL 수정 → PASS 후 커밋 승인.

---

## 7. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| 공용 헬퍼 추출 시 기존 full-pipeline 회귀 | 핵심 기능 손상 | 1차는 **import 재사용**(추출 안 함). 추출은 P2에서 테스트로 보호하며 별도 커밋 |
| concat 코덱/해상도 불일치 → 검은 화면 | 결과물 불량 | 기존 `image_merge`의 filter_complex+재인코딩 패턴 그대로 사용, fps/SAR/pix_fmt 통일 |
| 이미지만 업로드 시 길이 3초 < 기존 최소 10초 검증 | 엔드포인트 거부 | 멀티 경로 전용 최소 3초 규칙(기존 엔드포인트는 10초 유지) |
| 텍스트→SRT 타이밍이 영상 길이 변동(compress 후)과 불일치 | 자막 싱크 어긋남 | compress는 길이 불변(재인코딩만) 확인 후 compose 직후 측정 길이로 SRT 생성 |
| 대용량 멀티 파일 업로드 타임아웃 | 업로드 실패 | 파일별 spool + 백그라운드 업로드(기존 패턴), 클라이언트 timeout 상향 |
| 모바일 드래그 재정렬 UX | 사용성 | 1차 위/아래 버튼 fallback 제공, 필요 시 `@dnd-kit` 도입 |

### 롤백 전략
- 프론트: `UploadPage`가 기존 `Step*` 컴포넌트를 보존하므로 라우팅/플래그로 이전 플로우 복귀 가능.
- 백엔드/워커: 새 경로는 독립 추가분 → 신규 엔드포인트/`multi-pipeline` 분기만 비활성화하면 즉시 기존 동작.

---

## 8. 영향 파일 목록

**신규**
- `frontend/src/pages/upload/StepMedia.tsx`, `StepSubtitle.tsx`, `StepMeta.tsx` (+ `*.test.tsx`)
- `worker/tasks/compose.py`, `worker/tasks/full_pipeline_multi.py` (+ `test_compose.py`)
- `backend/tests/test_videos_multi.py`

**수정 (추가 위주, 기존 로직 보존)**
- `frontend/src/pages/UploadPage.tsx` (단계 배열·상태·업로드 호출)
- `frontend/src/i18n/locales/{ko,en}/upload.json`
- `frontend/src/api/{client,types}.ts` (멀티 업로드 타입)
- `backend/app/routes/videos.py` (`/upload-multi`, `_r2_upload_and_enqueue_multi`)
- `backend/app/services/job_queue.py` (`enqueue_multi_pipeline`)
- `worker/worker.py` (job_type 분기 1줄)
- `worker/tasks/subtitle.py` (`build_srt_from_text`)
- `worker/tasks/full_pipeline.py` (P2에서 `persist_upload` 공용 추출 — 선택)
- `docs/INDEX.md` (새 파일 매핑), `VERSION` (push 전 MINOR bump)

**불변 (회귀 보호 대상)**
- `run_full_pipeline` 처리 순서, `/videos/upload-pipeline`, `image_merge.run_image_merge`, `points_for_tags`, DB 스키마.

---

## 9. 확정 사항 (2026-06-29 사용자 결정)

1. **proof 개념 폐기**: 이미지는 일반 미디어와 동일 취급, 별도 증거사진 입력 없음. `proof_image_url`은 사용하지 않음(null).
2. **드래그 재정렬은 `@dnd-kit` 사용**: iOS/Android WebView 모두 호환되도록 `PointerSensor` + `TouchSensor`(activationConstraint로 스크롤과 구분) 구성.
3. **'영상 음성' 옵션은 영상이 있을 때만 활성**. 이미지만 있어도 **녹음 → 자막 추출/burn-in 가능**. 텍스트 후기 입력은 항상 가능.
4. `duration_sec` 최소 3초 저장은 구현 중 피드 자동재생/주간 포인트 집계에 이상 없는지 점검(영향 없을 것으로 판단).

---

## 10. 다음 액션

이 계획 승인 시:
1. `PROGRESS.md` 생성 (P1~P5).
2. P1(워커 compose 코어)부터 `team ralph`로 착수 (모델 라우팅 표 적용).
3. 각 Phase 종료마다 린트/테스트 결과 테이블 + 체크포인트 커밋 + `/clear` 요청.
