"""모네 인상주의 렌더러 — 업로드 영상 필터(`video_filter=monet`).

쿠와하라(Kuwahara) 필터로 평평한 유화 색면을 만들고, 이웃 붓자국마다 명도·색상을 조금씩
다르게 흔드는 "나란히 찍은 색"(broken color) 무늬를 얹는다. 그림자는 검정 대신 청보라,
밝은 곳은 크림빛 노랑으로 밀고, 밝은 곳을 번지게 하는 블룸과 캔버스 천 결을 더한다.
잔디·나무·물처럼 색이 넓게 펼쳐진 자연 배경에서 가장 잘 어울린다.

속도 설계: 원본 해상도(1080×1920)에서 float 연산을 하면 그것만으로 프레임당 ~100ms가
든다. 그래서 색에 관한 모든 단계(쿠와하라·팔레트·채도·붓자국·블룸)를 짧은 변
`_WORK_SHORT_SIDE`px 작업 해상도에서 끝내고 uint8로 바꾼 뒤 한 번만 키운다. 원본
해상도에서는 캔버스 결 곱하기(uint8 `cv2.multiply`) 하나만 한다. 붓자국은 기준 해상도에서
18px 크기의 저주파 무늬라 작업 해상도에서 칠한 뒤 키워도 모양이 같다. 반대로 캔버스 결은
2~3px 주기의 고주파 무늬라 원본 해상도에서 곱해야 결이 뭉개지지 않는다.

영상 깜빡임: 붓자국·캔버스 결은 고정 시드로 해상도마다 한 번만 만들어 캐시한다
(`sketch._paper_texture`와 같은 방식). 프레임마다 새로 만들면 화면 전체가 지글거린다.
cv2/numpy 외 앱 의존성을 두지 않는다 — worker가 이 모듈을 단독 import한다.
"""

from functools import lru_cache

import cv2
import numpy as np

from app.services.cartoon import _enhance

# 픽셀 단위 값은 짧은 변 540px 기준이며 해상도에 비례해 늘린다.
_REF_SHORT_SIDE = 540
# 색 연산을 하는 해상도(짧은 변). 낮출수록 빠르고 쿠와하라 색면도 커지지만, 너무 낮추면
# 사람·물체의 형태가 뭉개진다. 시안 비교에서 눈으로 잡은 균형점이다.
_WORK_SHORT_SIDE = 360

_KUWAHARA_RADIUS = 6  # 사분면 반경(기준 해상도 px)
_POST_BLUR_SIGMA = 1.1  # 쿠와하라 직후 사분면 경계의 계단을 눅이는 블러(작업 해상도 px)

# 팔레트: 그림자는 청보라, 밝은 곳은 크림빛 노랑으로 민다. 틴트 채도가 낮으면 원본의
# 어두운 녹색과 섞여 탁한 갈색이 되므로 파랑을 세게, 초록을 낮게 잡았다.
SHADOW_TINT_BGR = np.array([200, 60, 110], np.float32) / 255.0
HIGHLIGHT_TINT_BGR = np.array([198, 228, 255], np.float32) / 255.0
_SHADOW_MAX = 0.36  # 가장 어두운 곳에 섞는 청보라 비율(순검정을 피한다)
_HIGHLIGHT_MAX = 0.20
_SHADOW_KNEE = 0.50  # 이 휘도 아래부터 그림자 틴트가 커진다
_HIGHLIGHT_KNEE = 0.55  # 이 휘도 위부터 하이라이트 틴트가 커진다
_SAT_BOOST = 1.22

_DAB_PX = 18  # 붓자국 한 칸 크기(기준 해상도 px). 쿠와하라 색면보다 커야 격자가 겹쳐 보이지 않는다
_DAB_LUM_AMOUNT = 0.07  # 명도 변조 폭(±)
_DAB_HUE_DEG = 6.5  # 색상 변조 폭(±도, float HSV 0~360)

_BLOOM_THRESHOLD = 0.62
_BLOOM_SIGMA = 13.0  # 기준 해상도 px
_BLOOM_STRENGTH = 0.22

_WEAVE_AMPLITUDE = 0.045
_WEAVE_UNIT = 128  # 캔버스 결을 uint8 배율로 저장할 때 1.0에 해당하는 값(cv2.multiply scale=1/128)


def _smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


# 틴트 세기는 휘도만의 함수라 256단계 LUT로 미리 구해 둔다.
_LUM_STEPS = np.linspace(0.0, 1.0, 256, dtype=np.float32)
_SHADOW_AMT_LUT = (_SHADOW_MAX * _smoothstep((_SHADOW_KNEE - _LUM_STEPS) / _SHADOW_KNEE)).astype(np.float32)
_HIGHLIGHT_AMT_LUT = (
    _HIGHLIGHT_MAX * _smoothstep((_LUM_STEPS - _HIGHLIGHT_KNEE) / (1.0 - _HIGHLIGHT_KNEE))
).astype(np.float32)


def _kuwahara(bgr01: np.ndarray, gray: np.ndarray, radius: int) -> np.ndarray:
    """사분면 쿠와하라: 픽셀마다 네 사분면 중 휘도 분산이 가장 작은 쪽의 평균색을 고른다.

    분산이 작은 사분면은 경계를 넘지 않은 균일한 영역이라, 그 평균색을 쓰면 윤곽은 살고
    안쪽은 평평한 유화 색면이 된다. 네 사분면은 같은 k×k 박스 평균을 네 방향으로 밀어 읽은
    것이라, 가장자리를 복제해 붙인 (BGR+휘도) 4채널 이미지와 휘도² 이미지에 박스 필터를
    한 번씩만 걸고 잘라 읽는다. 5채널 이상으로 쌓으면 cv2.boxFilter가 느린 경로를 탄다.
    """
    k = radius + 1
    p = k - 1
    h, w = gray.shape
    stack = cv2.copyMakeBorder(cv2.merge([bgr01, gray]), p, p, p, p, cv2.BORDER_REPLICATE)
    sq = cv2.copyMakeBorder(gray * gray, p, p, p, p, cv2.BORDER_REPLICATE)
    m_all = cv2.boxFilter(stack, -1, (k, k), anchor=(0, 0))
    m2_all = cv2.boxFilter(sq, -1, (k, k), anchor=(0, 0))
    best_var = out = None
    for oy in (0, p):
        for ox in (0, p):
            m = m_all[oy : oy + h, ox : ox + w]
            mean_gray = m[..., 3]
            var = m2_all[oy : oy + h, ox : ox + w] - mean_gray * mean_gray
            if best_var is None:
                best_var, out = var, m.copy()
                continue
            better = (var < best_var).view(np.uint8)
            best_var = np.minimum(var, best_var)
            cv2.copyTo(m, better, out)
    return out[..., :3]


@lru_cache(maxsize=4)
def _dab_texture(h: int, w: int, dab_px: int) -> tuple[np.ndarray, np.ndarray]:
    """붓자국 무늬 (명도 배율 변조, 색상 변조[도]) — 작업 해상도용, 고정 시드로 한 번만 만든다.

    칸마다 독립적인 난수를 준 모자이크를 가우시안으로 눅여 둥근 붓자국 모양으로 만든다.
    """
    gh, gw = h // dab_px + 3, w // dab_px + 3

    def _to_dabs(seed: int) -> np.ndarray:
        cells = np.random.default_rng(seed).uniform(-1.0, 1.0, (gh, gw)).astype(np.float32)
        big = cv2.resize(cells, (gw * dab_px, gh * dab_px), interpolation=cv2.INTER_NEAREST)
        big = cv2.GaussianBlur(big, (0, 0), dab_px * 0.42)
        return np.ascontiguousarray(big[:h, :w])

    return 1.0 + _to_dabs(101) * _DAB_LUM_AMOUNT, _to_dabs(103) * _DAB_HUE_DEG


@lru_cache(maxsize=4)
def _canvas_weave(h: int, w: int, scale: float) -> np.ndarray:
    """캔버스 천 결: 가로세로 위빙 무늬 + 고정 시드 잔잡음. 원본 해상도 uint8 3채널 배율.

    값 `_WEAVE_UNIT`(128)이 배율 1.0이다. `cv2.multiply(img, weave, scale=1/128)`로 곱하면
    float 변환 없이 포화 연산으로 끝나 원본 해상도에서도 싸다.
    """
    period = max(2.0, 3.0 * scale)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    weave = np.sin(xx / period * np.pi) * np.sin(yy / period * np.pi)
    fine = np.random.default_rng(107).normal(0, 1, (max(2, h // 3), max(2, w // 3))).astype(np.float32)
    fine = cv2.resize(cv2.GaussianBlur(fine, (0, 0), 0.7), (w, h), interpolation=cv2.INTER_LINEAR)
    pattern = 0.65 * weave + 0.35 * fine / (fine.std() + 1e-6)
    mult = np.clip(np.rint(_WEAVE_UNIT * (1.0 + _WEAVE_AMPLITUDE * pattern)), 0, 255).astype(np.uint8)
    return cv2.merge([mult, mult, mult])


@lru_cache(maxsize=4)
def _paint_tables(h: int, w: int, dab_px: int) -> tuple[np.ndarray, ...]:
    """`_paint`에서 프레임 크기와 상수에만 의존하는 LUT·붓자국 배율을 한 번만 만든다."""
    keep = 1.0 - _SHADOW_AMT_LUT - _HIGHLIGHT_AMT_LUT
    add = SHADOW_TINT_BGR * _SHADOW_AMT_LUT[:, None] + HIGHLIGHT_TINT_BGR * _HIGHLIGHT_AMT_LUT[:, None]
    keep_lut = np.ascontiguousarray(np.repeat(keep[:, None], 3, axis=1).reshape(256, 1, 3), np.float32)
    add_lut = np.ascontiguousarray(add.reshape(256, 1, 3), np.float32)
    bright_lut = _smoothstep((_LUM_STEPS - _BLOOM_THRESHOLD) / (1.0 - _BLOOM_THRESHOLD)).astype(np.float32)
    sat_lut = np.clip(np.rint(np.arange(256) * _SAT_BOOST), 0, 255).astype(np.uint8)
    dab_lum, dab_hue = _dab_texture(h, w, dab_px)
    # HSV_FULL의 색상은 0~255(=360도)라 uint8 덧셈이 256에서 한 바퀴 돌아 색상환 회전과 같아진다.
    hue_off = np.rint(dab_hue * (256.0 / 360.0)).astype(np.int16).astype(np.uint8)
    val_mul = np.rint(dab_lum * _WEAVE_UNIT).astype(np.uint8)
    return keep_lut, add_lut, bright_lut, sat_lut, hue_off, val_mul


def _paint(work: np.ndarray, work_scale: float) -> np.ndarray:
    """작업 해상도 BGR uint8 → 쿠와하라·팔레트·채도·붓자국·블룸까지 입힌 BGR uint8."""
    h, w = work.shape[:2]
    keep_lut, add_lut, bright_lut, sat_lut, hue_off, val_mul = _paint_tables(
        h, w, max(2, round(_DAB_PX * work_scale))
    )
    work_f = work.astype(np.float32) * (1.0 / 255.0)
    gray = cv2.cvtColor(work_f, cv2.COLOR_BGR2GRAY)

    painted = _kuwahara(work_f, gray, max(1, round(_KUWAHARA_RADIUS * work_scale)))
    painted = cv2.GaussianBlur(painted, (0, 0), _POST_BLUR_SIGMA)
    lum8 = cv2.convertScaleAbs(cv2.cvtColor(painted, cv2.COLOR_BGR2GRAY), alpha=255.0)

    # 팔레트: painted * keep(휘도) + add(휘도). 두 항 모두 휘도 하나로 정해져 3채널 LUT로 뽑는다.
    lum3 = cv2.merge([lum8, lum8, lum8])
    graded = cv2.add(cv2.multiply(painted, cv2.LUT(lum3, keep_lut)), cv2.LUT(lum3, add_lut))

    # 채도를 올리고, 이웃 붓자국마다 명도·색상을 조금씩 다르게 흔든다(uint8 HSV_FULL).
    hsv = cv2.cvtColor(cv2.convertScaleAbs(graded, alpha=255.0), cv2.COLOR_BGR2HSV_FULL)
    hue, sat, val = cv2.split(hsv)
    out = cv2.cvtColor(
        cv2.merge([hue + hue_off, cv2.LUT(sat, sat_lut), cv2.multiply(val, val_mul, scale=1.0 / _WEAVE_UNIT)]),
        cv2.COLOR_HSV2BGR_FULL,
    )

    # 블룸: 밝은 곳만 뽑아 1/4 해상도에서 크게 번지게 한 뒤 스크린 합성으로 더한다.
    # 시그마가 커서 줄인 해상도에서 흐려도 결과가 같다.
    small = cv2.resize(cv2.LUT(lum8, bright_lut), (max(2, w // 4), max(2, h // 4)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), _BLOOM_SIGMA * work_scale / 4)
    bloom = cv2.convertScaleAbs(
        cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR), alpha=255.0 * _BLOOM_STRENGTH
    )
    return 255 - cv2.multiply(255 - out, 255 - cv2.merge([bloom, bloom, bloom]), scale=1.0 / 255.0)


def monet_frame(frame: np.ndarray, gamma: float = 1.0) -> np.ndarray:
    """BGR uint8 프레임 → 같은 크기의 모네풍 유화 프레임.

    `gamma`는 다른 렌더러와 같이 호출자(`filter_video`의 감마 EMA, 미리보기의
    `adaptive_gamma`)가 계산해 넘긴 저조도 보정값이다.
    """
    h, w = frame.shape[:2]
    short_side = min(h, w)
    work_short = min(short_side, _WORK_SHORT_SIDE)
    if work_short < short_side:
        f = work_short / short_side
        work = cv2.resize(frame, (max(2, round(w * f)), max(2, round(h * f))), interpolation=cv2.INTER_AREA)
    else:
        work = frame

    painted = _paint(_enhance(work, gamma, clip=1.6), work_short / _REF_SHORT_SIDE)
    if painted.shape[:2] != (h, w):
        painted = cv2.resize(painted, (w, h), interpolation=cv2.INTER_LINEAR)

    scale = max(1.0, short_side / _REF_SHORT_SIDE)
    return cv2.multiply(painted, _canvas_weave(h, w, scale), scale=1.0 / _WEAVE_UNIT)
