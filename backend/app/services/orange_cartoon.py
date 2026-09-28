"""오렌지 카툰 렌더러 — 업로드 영상 필터(`video_filter=orange_cartoon`).

미색 종이 위에 오렌지판·먹판 두 장을 겹쳐 찍은 2색 리노컷이다. 오렌지판은 보정된 밝기
g < 0.64인 영역, 먹판은 g < 0.22인 영역에 `sketch._line_mask` 윤곽선(3×3 dilate)을 더한
영역이며 오렌지판보다 (2·scale, 1.5·scale)px 어긋나게 찍어 손으로 맞춘 2도 인쇄처럼
보이게 한다. 두 판 모두 시드 고정 `_ink_wear` 결을 곱하고, 종이 결은
`sketch._paper_texture`를 그대로 쓴다. 빗금(평행선 해칭)은 넣지 않는다 — 시안 검토에서
사용자가 원치 않아 뺐다.

밝기 보정은 감마가 아니라 휘도를 lo~hi 백분위 범위로 늘리는 방식(`_tone`)이 전담한다.
cv2/numpy 외 앱 의존성을 두지 않는다 — worker가 이 모듈을 단독 import한다.

영상 단위 밝기 기준(`tone_range`) 설계: `cartoon.filter_video`는 영상을 구간으로 나눠 여러
프로세스가 병렬로 렌더링한다. 프레임마다 백분위를 새로 재면 장면이 바뀔 때마다 톤이
깜빡이고, 이전 프레임 값을 이어받는 EMA로 스무딩하면 구간 경계에서 프로세스가 갈리므로
이어줄 "이전 값"이 없어 톤이 끊긴다. 그래서 `cartoon.filter_video`가 영상 전체에서 균등
간격 샘플 프레임을 몇 장(8~12) 뽑아 `sample_tone_range()`로 lo/hi를 한 번만 계산하고,
그 값을 모든 구간에 동일하게 넘긴다(`frame_renderer`가 클로저로 고정해 넘긴다). 1프레임
미리보기처럼 `tone_range=None`이면 그 프레임 한 장만으로 lo/hi를 계산한다.
"""

from functools import lru_cache

import cv2
import numpy as np

from app.services.sketch import (
    _REF_SHORT_SIDE,
    _line_mask,
    _paper_texture,
    _reference_gray,
    _solid,
)

PAPER_BGR = np.array([226, 236, 242], np.float32) / 255.0  # 미색 종이
ORANGE_BGR = np.array([26, 120, 232], np.float32) / 255.0  # 오렌지판
INK_BGR = np.array([30, 26, 28], np.float32) / 255.0  # 먹판

# 밝기 보정: 휘도를 이 백분위 범위로 늘려 0~1로 정규화한다.
_TONE_LO_PCT = 2.0
_TONE_HI_PCT = 98.0
_TONE_BLUR_SIGMA = 2.0  # 백분위 스트레치 후 판 경계를 부드럽게(짧은 변 기준 scale 비례)

_ORANGE_THRESHOLD = 0.64  # g < 이 값이면 오렌지판
_BLACK_THRESHOLD = 0.22  # g < 이 값이면 먹판(오렌지판과 겹칠 수 있음)
_EDGE_DILATE_KERNEL = np.ones((3, 3), np.uint8)

_ORANGE_BLUR_SIGMA = 0.8
_BLACK_BLUR_SIGMA = 0.7
_INK_SHIFT_X = 2.0  # 먹판을 오렌지판 대비 어긋나게 찍는 오프셋(px, scale 비례)
_INK_SHIFT_Y = 1.5


def _tone(frame: np.ndarray, scale: float, tone_range: tuple[float, float] | None) -> np.ndarray:
    """휘도를 lo~hi 백분위 범위로 늘려 0~1로 정규화한다.

    `tone_range`가 없으면(단일 프레임 미리보기 등) 이 프레임 한 장만으로 2~98 백분위를 잰다.
    영상 변환 시에는 `cartoon.filter_video`가 미리 계산한 값을 넘겨 구간마다 달라지지
    않게 한다.
    """
    g = _reference_gray(frame, 1.0, scale)
    if tone_range is None:
        lo, hi = np.percentile(g, (_TONE_LO_PCT, _TONE_HI_PCT))
    else:
        lo, hi = tone_range
    return np.clip((g - lo) / max(hi - lo, 1e-3), 0, 1)


@lru_cache(maxsize=4)
def _ink_wear(h: int, w: int, scale: float) -> np.ndarray:
    """잉크가 덜 묻은 목판 결. 시드가 고정이라 구간 병렬 프로세스끼리도 같은 결이 나온다.

    `sketch._paper_texture`와 같은 이유로 해상도별 캐시를 둔다 — 프레임마다 새로 만들면
    화면 전체가 깜빡이고, rng 호출·리사이즈 자체도 매 프레임 비용이 든다.
    """
    rng = np.random.default_rng(11)
    n = rng.normal(0, 1, (max(2, int(h / (3 * scale))), max(2, int(w / (3 * scale))))).astype(np.float32)
    n = cv2.resize(cv2.GaussianBlur(n, (0, 0), 1.2), (w, h), interpolation=cv2.INTER_CUBIC)
    streak = cv2.resize(
        rng.normal(0, 1, (max(2, h // 40), max(2, w // 2))).astype(np.float32), (w, h)
    )
    return np.clip(1.0 - 0.18 * (n > 1.3) - 0.10 * (streak > 1.5), 0, 1).astype(np.float32)


@lru_cache(maxsize=4)
def _paper_background(h: int, w: int) -> np.ndarray:
    """판을 찍기 전의 종이(결이 섞인 미색) uint8 이미지. 해상도마다 한 번만 만든다."""
    out = _paper_texture(h, w)[..., None] * PAPER_BGR
    return np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


def _compose(ink_masks: list[np.ndarray], colors: list[np.ndarray], h: int, w: int) -> np.ndarray:
    """종이 결 바탕에 판(오렌지 → 먹) 순서로 겹쳐 찍는다.

    원본 해상도 전체를 float32 3채널로 섞으면 1080p 기준 판 두 장에 프레임당 120ms가량
    든다. 바탕과 잉크판을 uint8로 캐시해 두고 `cv2.blendLinear`로 판마다 한 번씩 섞는다.
    """
    out = _paper_background(h, w)
    for mask, color in zip(ink_masks, colors):
        out = cv2.blendLinear(out, _solid(h, w, tuple(color.tolist())), 1.0 - mask, mask)
    return out


def sample_tone_range(frames) -> tuple[float, float]:
    """여러 프레임을 모아 밝기 기준(2~98 백분위)을 한 번만 계산한다.

    `cartoon.filter_video`가 영상 전체에서 균등 간격으로 뽑은 8~12장을 넘긴다. 프레임마다
    따로 재지 않고 휘도를 모두 모아(pool) 한 번에 재는 이유는 모듈 docstring 참고.
    """
    grays = []
    for frame in frames:
        h, w = frame.shape[:2]
        scale = max(1.0, min(h, w) / _REF_SHORT_SIDE)
        grays.append(_reference_gray(frame, 1.0, scale).ravel())
    pooled = np.concatenate(grays)
    lo, hi = np.percentile(pooled, (_TONE_LO_PCT, _TONE_HI_PCT))
    return float(lo), float(hi)


def orange_cartoon_frame(
    frame: np.ndarray, gamma: float = 1.0, tone_range: tuple[float, float] | None = None,
) -> np.ndarray:
    """BGR 프레임 1장을 오렌지·먹 2색 리노컷으로 변환한다(같은 크기의 BGR uint8).

    `gamma`는 `cartoon.frame_renderer`의 공용 호출 규약 `(frame, gamma)`을 맞추기 위해
    받지만 쓰지 않는다 — 밝기 보정은 감마가 아니라 `tone_range` 기반 백분위 스트레치
    (`_tone`)가 전담한다.
    """
    h, w = frame.shape[:2]
    scale = max(1.0, min(h, w) / _REF_SHORT_SIDE)

    # 톤 블러와 윤곽선 추출은 기준 해상도(짧은 변 540px)에서 하고 결과만 원본 크기로 키운다.
    # 원본 해상도에서 하면 1080p 기준 프레임당 100ms가량 더 들지만 모습은 사실상 같다
    # (`sketch._reference_gray` docstring 참고).
    g = cv2.GaussianBlur(_tone(frame, scale, tone_range), (0, 0), _TONE_BLUR_SIGMA)
    lines = _line_mask(g, 1.0)
    if g.shape != (h, w):
        g = cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR)
        lines = cv2.resize(lines, (w, h), interpolation=cv2.INTER_LINEAR)

    wear = _ink_wear(h, w, scale)
    orange = (g < _ORANGE_THRESHOLD).astype(np.float32)
    black = (g < _BLACK_THRESHOLD).astype(np.float32)
    edges = cv2.dilate((lines > 0.5).astype(np.uint8), _EDGE_DILATE_KERNEL).astype(np.float32)
    black = np.maximum(black, edges)

    # 먹판을 오렌지판 대비 살짝 어긋나게 찍는다 — 손으로 맞춘 2도 인쇄 느낌.
    shift = np.float32([[1, 0, _INK_SHIFT_X * scale], [0, 1, _INK_SHIFT_Y * scale]])
    black = cv2.warpAffine(black, shift, (w, h))

    orange = cv2.GaussianBlur(orange, (0, 0), _ORANGE_BLUR_SIGMA * scale) * wear
    black = cv2.GaussianBlur(black, (0, 0), _BLACK_BLUR_SIGMA * scale) * wear
    return _compose([orange, black], [ORANGE_BGR, INK_BGR], h, w)
