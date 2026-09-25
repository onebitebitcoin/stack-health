"""흑백 선 크로키 렌더러 — 업로드 영상 필터(`video_filter=sketch`).

카툰 필터와 같은 저조도 전처리(감마 + CLAHE) 뒤에 윤곽선만 뽑아 미색 종이 위에 흑연색으로
긋는다. 영상 변환(구간 병렬·인코딩·오디오 보존)은 `cartoon.filter_video`가 공유한다.
cv2/numpy 외 앱 의존성을 두지 않는다 — worker가 이 모듈을 단독 import한다.
"""

from functools import lru_cache

import cv2
import numpy as np

from app.services.cartoon import _enhance

# 픽셀 단위 값은 짧은 변 540px 기준이며 해상도에 비례해 늘린다.
_REF_SHORT_SIDE = 540

PAPER_BGR = np.array([234, 240, 244], np.float32) / 255.0  # 미색 종이
INK_BGR = np.array([38, 36, 40], np.float32) / 255.0  # 흑연

# 전처리 bilateral은 기준 해상도로 줄여서 건다. 원본 해상도에서 걸면 1080p 기준 프레임당
# 수백 ms가 들고, 커널을 해상도에 맞춰 키우지 않으면 잔질감이 덜 지워져 룩이 해상도마다 달라진다.
_BILATERAL_PASSES = 2

# 선 추출: DoG(σ, 1.6σ) 값이 _EPS_STRONG 아래면 확실한 선, _EPS_WEAK 아래면 약한 선이다.
# 약한 선은 확실한 선과 이어진 조각일 때만 남긴다(히스테리시스). 그래서 대비가 낮은
# 역광 윤곽은 끊기지 않고, 벽·바닥의 고립된 잔질감은 점으로 남지 않는다.
_DOG_SIGMA = 0.9
_DOG_TAU = 0.99
_EPS_STRONG = -0.012
_EPS_WEAK = -0.003
_LINE_MIN_AREA = 80  # 이보다 작은 선 조각은 버린다(기준 해상도 px²)
_LINE_SOFTEN_SIGMA = 0.6  # 이진 선 가장자리를 살짝 풀어 계단 현상을 줄인다


@lru_cache(maxsize=4)
def _paper_texture(h: int, w: int) -> np.ndarray:
    """해상도별로 고정된 종이 결. 시드가 고정이라 구간 병렬 프로세스끼리도 같은 결이 나온다.

    프레임마다 새로 만들면 화면 전체가 깜빡인다. 결은 짧은 변 540px 기준 크기로 만든 뒤
    확대한다 — 원본 해상도에서 만들면 고해상도일수록 결이 잘아져 룩이 달라진다.
    """
    scale = max(1.0, min(h, w) / _REF_SHORT_SIDE)
    if scale > 1.0:
        base = _paper_texture(max(2, round(h / scale)), max(2, round(w / scale)))
        return cv2.resize(base, (w, h), interpolation=cv2.INTER_LINEAR)
    rng = np.random.default_rng(7)
    fine = cv2.GaussianBlur(rng.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 0.8)
    coarse = rng.normal(0, 1, (h // 8 + 1, w // 8 + 1)).astype(np.float32)
    coarse = cv2.resize(cv2.GaussianBlur(coarse, (0, 0), 2), (w, h), interpolation=cv2.INTER_CUBIC)
    grain = 1.0 - 0.012 * fine / (fine.std() + 1e-6) - 0.015 * coarse / (coarse.std() + 1e-6)
    return np.clip(grain, 0.85, 1.05).astype(np.float32)


def _smoothed_gray(frame: np.ndarray, gamma: float, scale: float) -> np.ndarray:
    """감마·CLAHE 보정 후 기준 해상도에서 bilateral로 잔질감을 지운 휘도(0~1, 원본 해상도)."""
    h, w = frame.shape[:2]
    enh = _enhance(frame, gamma, clip=1.6)
    if scale > 1.0:
        enh = cv2.resize(enh, (round(w / scale), round(h / scale)), interpolation=cv2.INTER_AREA)
    for _ in range(_BILATERAL_PASSES):
        enh = cv2.bilateralFilter(enh, 9, 60, 7)
    gray = cv2.cvtColor(enh, cv2.COLOR_BGR2GRAY)
    if gray.shape != (h, w):
        gray = cv2.resize(gray, (w, h), interpolation=cv2.INTER_LINEAR)
    return gray.astype(np.float32) / 255.0


def _line_mask(gray: np.ndarray, scale: float) -> np.ndarray:
    """선 위치 1, 종이 0인 float 마스크."""
    sigma = _DOG_SIGMA * scale
    g1 = cv2.GaussianBlur(gray, (0, 0), sigma)
    g2 = cv2.GaussianBlur(gray, (0, 0), sigma * 1.6)
    dog = g1 - _DOG_TAU * g2
    weak = (dog < _EPS_WEAK).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(weak, 8)
    keep = np.zeros(n, bool)
    keep[np.unique(labels[dog < _EPS_STRONG])] = True
    keep &= stats[:, cv2.CC_STAT_AREA] >= _LINE_MIN_AREA * scale * scale
    keep[0] = False  # 배경 라벨
    return cv2.GaussianBlur(keep[labels].astype(np.float32), (0, 0), _LINE_SOFTEN_SIGMA * scale)


def sketch_frame(frame: np.ndarray, gamma: float = 1.0) -> np.ndarray:
    """BGR 프레임 1장을 흑백 선 크로키로 변환한다(같은 크기의 BGR uint8)."""
    h, w = frame.shape[:2]
    scale = max(1.0, min(h, w) / _REF_SHORT_SIDE)
    ink = _line_mask(_smoothed_gray(frame, gamma, scale), scale)
    tone = ((1.0 - ink) * _paper_texture(h, w))[..., None]
    out = tone * PAPER_BGR + (1.0 - tone) * INK_BGR
    return np.clip(out * 255.0, 0, 255).astype(np.uint8)
