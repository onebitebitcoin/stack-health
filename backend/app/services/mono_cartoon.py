"""흑백 카툰 렌더러 — 업로드 영상 필터(`video_filter=mono_cartoon`).

흰 종이 위에 밝은 회색·짙은 회색·먹 세 톤을 면으로 칠하고 윤곽선을 먹으로 그은 흑백
만화 느낌이다. 뼈대는 `orange_cartoon`과 같다: 휘도를 lo~hi 백분위로 늘려 0~1로 만들고
(`orange_cartoon._tone`), 보정된 밝기 g가 문턱값보다 어두운 영역마다 한 톤씩 겹쳐 찍은 뒤
`sketch._line_mask` 윤곽선을 먹판에 더한다. 오렌지 카툰과 달리 판을 어긋나게 찍거나
목판 결을 넣지 않는다. 깔끔한 펜 선과 평평한 톤이 이 필터의 룩이다.

컬러 카툰(`cartoon_frame`)을 흑백으로 바꾸는 방식은 시안에서 버렸다. 어두운 장면에서는
셀 면이 짙은 회색으로 가라앉아 먹 윤곽선이 묻힌다. 톤 수를 셋으로 줄이고 밝기 기준을
영상마다 늘려야 면과 선이 또렷하게 갈린다.

밝기 기준(`tone_range`)은 `cartoon.filter_video`가 영상 전체 샘플로 한 번 계산해 넘긴다.
이유는 `orange_cartoon` 모듈 docstring과 같다(구간 병렬에서도 톤이 깜빡이지 않게).
cv2/numpy 외 앱 의존성을 두지 않는다 — worker가 이 모듈을 단독 import한다.
"""

from functools import lru_cache

import cv2
import numpy as np

from app.services.orange_cartoon import _EDGE_DILATE_KERNEL, _TONE_BLUR_SIGMA, _tone
from app.services.sketch import _REF_SHORT_SIDE, _line_mask, _paper_texture, _solid

PAPER_BGR = np.array([244, 244, 242], np.float32) / 255.0  # 흰 종이(아주 옅은 웜톤)
# (문턱값, 톤 색) — 보정된 밝기 g가 문턱값보다 어두우면 그 톤을 칠한다. 밝은 톤부터 겹쳐 찍는다.
TONES = (
    (0.70, (0.72, 0.72, 0.72)),  # 밝은 회색
    (0.42, (0.45, 0.45, 0.45)),  # 짙은 회색
    (0.18, (0.10, 0.10, 0.11)),  # 먹
)
_TONE_EDGE_SIGMA = 0.8  # 톤 경계를 부드럽게(기준 해상도 px)
_LINE_EDGE_SIGMA = 0.7


@lru_cache(maxsize=4)
def _paper_background(h: int, w: int) -> np.ndarray:
    """종이 결이 섞인 흰 바탕 uint8 이미지. 해상도마다 한 번만 만든다."""
    out = _paper_texture(h, w)[..., None] * PAPER_BGR
    return np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


def mono_cartoon_frame(
    frame: np.ndarray, gamma: float = 1.0, tone_range: tuple[float, float] | None = None,
) -> np.ndarray:
    """BGR 프레임 1장을 흑백 카툰으로 변환한다(같은 크기의 BGR uint8).

    `gamma`는 `cartoon.frame_renderer`의 공용 호출 규약을 맞추려고 받지만 쓰지 않는다.
    밝기 보정은 `tone_range` 기반 백분위 스트레치(`orange_cartoon._tone`)가 전담한다.
    """
    h, w = frame.shape[:2]
    scale = max(1.0, min(h, w) / _REF_SHORT_SIDE)

    # 톤 블러와 윤곽선 추출은 기준 해상도에서 하고 결과만 원본 크기로 키운다.
    g = cv2.GaussianBlur(_tone(frame, scale, tone_range), (0, 0), _TONE_BLUR_SIGMA)
    lines = _line_mask(g, 1.0)
    if g.shape != (h, w):
        g = cv2.resize(g, (w, h), interpolation=cv2.INTER_LINEAR)
        lines = cv2.resize(lines, (w, h), interpolation=cv2.INTER_LINEAR)

    edges = cv2.dilate((lines > 0.5).astype(np.uint8), _EDGE_DILATE_KERNEL)
    out = _paper_background(h, w)
    for i, (threshold, color) in enumerate(TONES):
        mask = (g < threshold).astype(np.uint8)
        if i == len(TONES) - 1:
            mask = np.maximum(mask, edges)  # 윤곽선은 먹판에 함께 찍는다
        sigma = (_LINE_EDGE_SIGMA if i == len(TONES) - 1 else _TONE_EDGE_SIGMA) * scale
        m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), sigma)
        out = cv2.blendLinear(out, _solid(h, w, color), 1.0 - m, m)
    return out
