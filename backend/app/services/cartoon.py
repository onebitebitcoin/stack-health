"""셀 셰이딩 카툰 렌더러 — 업로드 영상 필터.

video-editor 프로젝트에서 검증된 파이프라인 이식:
저조도 적응 감마 + CLAHE → L채널 셀 양자화 → DoG 잉크 라인.

backend(1프레임 미리보기)와 worker(전체 영상 변환, `cartoonize_video`)가 공유한다.
cv2/numpy 외 앱 의존성을 두지 않는다 — worker가 이 모듈을 단독 import한다.

영상은 프레임 사이 흔들림을 세 단계로 줄인다: 광류 보정 시간 잡음 제거(`TemporalDenoiser`) →
카툰 셀 단계의 광류 이동(`CelState.warp`) → 렌더 출력 안정화(`OutputStabilizer`, 모든 필터).
CLAHE 보정량도 광류로 옮겨 가며 시간 방향으로 섞는다(`ClaheSmoother`) — 타일이 화면에 고정돼 있어
카메라가 움직이면 같은 면의 보정 곡선이 바뀌고 셀 색면이 통째로 한 단계 튀기 때문이다.
"""

import logging
import multiprocessing as mp
import os
import subprocess
import tempfile
import threading
from functools import lru_cache

import cv2
import numpy as np

logger = logging.getLogger(__name__)

LINE_BGR = np.array([45, 42, 48], np.uint16)  # 카툰 윤곽선 (잉크)
_LINE_BGR_U8 = LINE_BGR.astype(np.uint8)  # 블렌드용 — cv2.multiply는 입력 dtype을 맞춰야 한다

# DoG 두 번째 블러를 원본이 아니라 첫 블러 결과에 덧씌울 때의 σ.
# 가우시안 합성: σ_total² = σ1² + σ2² → σ2 = sqrt(3.0² - 1.4²) ≈ 2.65
_DOG_SIGMA2_CASCADE = float(np.sqrt(3.0**2 - 1.4**2))

# L채널 셀 양자화 LUT: 0.8*(round(L/42.5)*42.5) + 0.2*L — 6단계 소프트 양자화
_CEL_STEP = 42.5
_CEL_HYSTERESIS = 0.15  # 셀 단계 경계 여유(단계 단위, L 약 6레벨)
_CEL_HOLD_MAX = 12  # 직전 단계를 붙잡는 최대 프레임 수(30fps 기준 0.4초)
_CEL_LUT = np.clip(
    0.8 * (np.round(np.arange(256, dtype=np.float32) / 42.5) * 42.5)
    + 0.2 * np.arange(256, dtype=np.float32),
    0,
    255,
).astype(np.uint8)

# 잉크 선 조각 필터·셀 면 정리의 픽셀 값은 짧은 변 540px 기준이며 해상도에 비례해 늘린다.
# 어두운 영상은 감마·CLAHE가 벽·바닥의 잔질감까지 키워서, 면적만 보는 필터로는 짧은 점선
# 조각이 화면 전체에 "땡땡이"로 남았다(실측: 조각의 약 60%가 12px 이하). 그래서 짧은 조각은
# 대비가 강할 때만 남긴다 — 눈·입 같은 이목구비는 짧아도 DoG 피크가 높고, 질감은 낮다.
_REF_SHORT_SIDE = 540
_LINE_MIN_AREA = 14
_LINE_MIN_LEN = 16  # 이보다 짧은 조각(바운딩 박스 긴 변)은 대비가 강할 때만 남긴다
_LINE_STRONG_DOG = 16  # 짧은 조각을 살리는 DoG 최소 피크(0~255). 9·12는 질감이 남고 16부터 깨끗했다
# 선 농도: DoG가 LO 미만이면 선 후보에서 빠지고, LO-0.5~HI 사이에서 서서히 진해진다.
# LO를 3으로 낮추면 옅은 선이 늘어 패닝에서 오히려 아른거렸다(warp-MAD +20%).
_LINE_DOG_LO = 4
_LINE_DOG_HI = 6.0
_CEL_MEDIAN_K = 13  # 셀 양자화 전 L 중앙값 필터 — 잔질감이 만든 얼룩 조각을 주변 면으로 흡수한다.
# 5에서 13으로 키웠다: 자갈·옷 주름이 잘게 쪼개진 색 조각이 움직일 때마다 꿈틀댔다(실측 조각 -65%,
# 프레임 간 차이 정지 -30%·손떨림 -13%). 그림은 조금 더 평평해진다.
_LINE_MEDIAN_K = 9  # 잉크선(DoG) 입력용 중앙값 필터. 색면과 같은 13을 쓰면 눈·입 같은 작은 특징의 윤곽이 사라져 작게 둔다.
# 9는 14px 이상 특징(전신 영상의 눈·손)의 윤곽을 지키면서 잔질감 선 조각을 줄인다(5 대비 정지 장면 차이 -18%)

# 군집 억제: 조각 하나하나는 길이·대비 필터를 통과해도, 질감 위에서는 짧은 조각이 좁은 곳에
# 수십 개씩 모여 "환공포증" 무늬가 된다(피드 실측: 보도·낙엽·카펫). 짧은 조각만 모은 마스크의
# 국소 밀도가 높은 곳의 짧은 조각을 버린다. 긴 윤곽과 주변이 빈 짧은 선(눈·입)은 남는다.
_CLUSTER_FRAG_LEN = 60  # 이보다 짧은 조각(바운딩 박스 긴 변, 기준 px)이 군집 판정 대상
_CLUSTER_WIN = 41  # 밀도를 재는 창(기준 px)
_CLUSTER_MAX_DENSITY = 0.06  # 창 안 짧은 조각 잉크 비율이 이보다 높으면 질감으로 본다
# DoG σ·커널은 짧은 변 1080px에서 맞춘 값이라 그보다 큰 영상(4K 등)에서는 비례해 키운다.
# 고정 px로 두면 4K 원본에서 같은 장면이 더 잘게 쪼개져 조각이 수천 개로 늘었다(실측 5,751개).
_DOG_REF_SHORT_SIDE = 1080


def _scale_px(px: int, short_side: int) -> int:
    return max(1, round(px * short_side / _REF_SHORT_SIDE))


def _ramp(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """lo 이하 0, hi 이상 1, 그 사이는 smoothstep. 이진 문턱값 대신 쓰는 연속 판정."""
    t = np.clip((np.asarray(x, np.float32) - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _cluster_weight(
    keep: np.ndarray, labels: np.ndarray, stats: np.ndarray, short_side: int
) -> np.ndarray:
    """`keep`(라벨별 가중치 0~1)에서 짧은 조각이 빽빽이 모인 곳의 가중치를 줄인 새 배열.

    짧은 조각 여부와 밀도 초과 여부를 모두 연속값으로 판정한다. 예전처럼 0/1로 정하면
    밀도가 문턱값 근처인 조각이 프레임마다 통째로 나타났다 사라졌다.
    """
    s = short_side / _REF_SHORT_SIDE
    long_side = np.maximum(stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT])
    frag = 1.0 - _ramp(long_side, _CLUSTER_FRAG_LEN * s * 0.8, _CLUSTER_FRAG_LEN * s * 1.2)
    frag_w = (keep * frag).astype(np.float32)
    frag_mask = frag_w[labels]
    h, w = frag_mask.shape
    # 밀도는 저주파라 1/4 크기에서 구해도 결과가 같다(1080p 기준 수 ms)
    quarter = cv2.resize(frag_mask, (max(1, w // 4), max(1, h // 4)), interpolation=cv2.INTER_AREA)
    k = max(3, int(_CLUSTER_WIN * s / 4) | 1)
    density = cv2.resize(cv2.blur(quarter, (k, k)), (w, h), interpolation=cv2.INTER_LINEAR)
    area = np.maximum(stats[:, cv2.CC_STAT_AREA], 1)
    mean_density = np.bincount(labels.ravel(), weights=(density * (labels > 0)).ravel(), minlength=len(keep)) / area
    dense = _ramp(mean_density, _CLUSTER_MAX_DENSITY * 0.67, _CLUSTER_MAX_DENSITY * 1.33)
    return keep * (1.0 - frag * dense)


# NlMeans 등 OpenCV 연산은 멀티스레드 확장성이 낮아(10코어 ~1.4x) 프레임 단위
# 프로세스 병렬화가 효과적이다. 워커는 OpenCV 내부 스레딩을 꺼서 과다구독을 막는다.


def _worker_pool_size() -> int:
    """호출 시점의 병렬 프로세스 수. FFMPEG_ACTIVE_JOBS(현재 활성 잡 수 — worker.py가
    슬롯 획득 직후와 렌더 단계 진입 시 갱신)가 있으면 그 값으로, 없으면(단독 실행·테스트)
    WORKER_INSTANCES(정적 인스턴스 수)로 코어를 나눈다.

    잡마다 값이 바뀌므로 모듈 임포트 시점이 아니라 매 호출 시점에 읽는다 — 정적
    WORKER_INSTANCES 나눗셈은 "모든 인스턴스가 항상 바쁘다"고 가정해 잡이 하나뿐일
    때도 코어를 남겨뒀다(예: 8코어·2인스턴스 → 잡 1개뿐이어도 3개만 사용).

    한계: 이 값은 렌더 시작 시점의 스냅샷이다. 렌더가 도는 도중 다른 잡이 합류하면
    그 잡은 자기 시점 기준으로 풀을 잡으므로 일시적으로 총 프로세스 수가 코어 예산을
    넘을 수 있다(8코어·2잡 겹침 최악 6+3=9). CPU는 CFS가 나눠주므로 둘 다 느려질 뿐
    실패하지는 않는다 — 렌더 중 재조회로 풀을 줄이려면 이미 spawn된 프로세스를
    죽여야 해서 얻는 것보다 잃는 게 크다고 판단해 스냅샷으로 둔다.
    """
    active = os.environ.get("FFMPEG_ACTIVE_JOBS") or os.environ.get("WORKER_INSTANCES", "1")
    return max(1, ((os.cpu_count() or 4) - 2) // max(1, int(active)))


_CHUNK = 16  # 청크 단위 map: 전 프레임을 메모리에 들고 있지 않도록 제한
_MIN_SEGMENT_FRAMES = 90  # ~3초@30fps 미만은 분할 실익이 없음(프로세스 기동비용이 더 큼)
# 구간 앞쪽 읽기 여유. 이것만으로 EMA가 수렴하지 않으므로 선행 패스의 정확한 상태를
# 함께 넘긴다. 샘플 주기는 패딩 기준이 아니라 영상의 절대 프레임 번호에 맞춘다.
_SEG_PAD_FRAMES = 60
# 구간 시작 전 렌더만 하고 버리는 프레임 수. 셀 히스테리시스·CLAHE 평활(α0.1 ≈ 10프레임 시정수)·
# 출력 안정화기 상태를 수렴시킨다. 모자라면 구간 첫 프레임에서 한 프레임 튄다(1262번 글 511·1022프레임 실측).
# _SEG_PAD_FRAMES를 넘으면 안 된다.
_SEQ_WARMUP_FRAMES = 30
_CLAHE_SMOOTH_ALPHA = 0.1  # CLAHE 보정량 EMA 계수 — 클수록 현재 프레임 쪽
_GAMMA_SAMPLE_EVERY = 5  # 감마 재계산 주기(프레임). 노출은 연속적이라 매 프레임 잴 필요가 없다


# 시간 방향 잡음 제거: 이전 프레임과 차이가 작은 픽셀(센서 잡음)만 이전 값 쪽으로 당긴다.
# 차이가 큰 픽셀(실제 움직임)은 가중치가 0에 가까워 그대로 두므로 잔상이 거의 남지 않는다.
# 어두운 영상에서 CLAHE가 잡음을 2~4배로 키워 필터 출력 전체가 아른거리던 것을 줄인다.
# σ8은 깜빡임을 조금 더 줄이지만 대비 15인 물체가 지나간 자리에 13% 잔상이 남았다(σ6은 3%).
_TDN_SIGMA = 6.0
_TDN_STRENGTH = 0.8
_TDN_LUT = np.rint(
    255 * _TDN_STRENGTH * np.exp(-(np.arange(256, dtype=np.float32) ** 2) / (2 * _TDN_SIGMA**2))
).astype(np.uint8)


# 움직임 보상: 카메라가 움직이면 같은 좌표의 이전 프레임 픽셀은 다른 물체라 시간 필터가 꺼져 버린다.
# 1/4 해상도 Farneback 광류로 이전 프레임을 현재 좌표로 끌어와(warp) 같은 지점끼리 비교한다.
_FLOW_SCALE = 4


def _flow_small(cur_bgr: np.ndarray, prev_bgr: np.ndarray) -> np.ndarray:
    """cur에서 prev로 가는 광류(1/4 해상도, float32). cur(x) ≈ prev(x + flow)."""
    def gray(img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        small = cv2.resize(img, (max(2, w // _FLOW_SCALE), max(2, h // _FLOW_SCALE)), interpolation=cv2.INTER_AREA)
        return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    return cv2.calcOpticalFlowFarneback(gray(cur_bgr), gray(prev_bgr), None, 0.5, 3, 15, 3, 5, 1.2, 0)


@lru_cache(maxsize=4)
def _base_grid(w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    return np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))


def _flow_maps(flow_small: np.ndarray, w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    """작은 광류를 (w, h)로 키워 cv2.remap용 좌표 맵 (mapx, mapy)로 바꾼다."""
    sx = w / flow_small.shape[1]
    sy = h / flow_small.shape[0]
    flow = cv2.resize(flow_small, (w, h), interpolation=cv2.INTER_LINEAR)
    gx, gy = _base_grid(w, h)
    return gx + flow[..., 0] * sx, gy + flow[..., 1] * sy


def _blend_toward_prev(cur: np.ndarray, prev_warped: np.ndarray, lut: np.ndarray) -> np.ndarray:
    """차이가 작은 픽셀만 이전 값 쪽으로 당긴 float32 결과."""
    diff = cv2.subtract(cur, prev_warped)
    weight = cv2.LUT(cv2.convertScaleAbs(diff), lut).astype(np.float32)
    return cv2.subtract(cur, cv2.multiply(diff, weight, scale=1.0 / 255.0))


class TemporalDenoiser:
    """프레임을 순서대로 넣으면 잡음을 줄인 프레임을 돌려준다. 이전 프레임 상태를 들고 있다.

    이전 결과를 광류로 현재 좌표에 맞춘 뒤 섞으므로 카메라·물체가 움직여도 잡음이 줄어든다.
    `flow`는 가장 최근 프레임의 작은 광류(첫 프레임·해상도 변경 직후는 None)로, 셀 상태 보정과
    출력 안정화가 이어받아 쓴다.
    """

    def __init__(self) -> None:
        self._prev: np.ndarray | None = None
        self._raw: np.ndarray | None = None  # 직전 원본 프레임 — 광류는 잡음 제거 전 원본끼리 잰다
        self.flow: np.ndarray | None = None

    def __call__(self, frame: np.ndarray) -> np.ndarray:
        cur = frame.astype(np.float32)
        if self._prev is None or self._raw is None or self._prev.shape != cur.shape:
            self._prev = cur
            self._raw = frame
            self.flow = None
            return frame
        self.flow = _flow_small(frame, self._raw)
        self._raw = frame
        h, w = frame.shape[:2]
        mapx, mapy = _flow_maps(self.flow, w, h)
        warped = cv2.remap(self._prev, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        self._prev = _blend_toward_prev(cur, warped, _TDN_LUT)
        return cv2.convertScaleAbs(self._prev)


# 출력 안정화: 잡음 제거는 입력 쪽 잔떨림만 잡는다. 렌더 결과(셀 경계·잉크선)에 남은 프레임 간
# 흔들림은 출력 프레임끼리 같은 방식(광류 보정 + 차이가 작을 때만 당김)으로 한 번 더 줄인다.
# σ12는 렌더 후 흔들림이 입력 잡음보다 커서 넉넉히 잡은 값이다. 큰 변화(새 물체)는 가중치가 ~0이라 남지 않는다.
_OUT_SIGMA = 12.0
_OUT_STRENGTH = 0.6
_OUT_LUT = np.rint(
    255 * _OUT_STRENGTH * np.exp(-(np.arange(256, dtype=np.float32) ** 2) / (2 * _OUT_SIGMA**2))
).astype(np.uint8)


class OutputStabilizer:
    """렌더된 출력 프레임을 순서대로 넣으면 프레임 간 흔들림을 줄여 돌려준다. 모든 필터 공용."""

    def __init__(self) -> None:
        self._prev: np.ndarray | None = None

    def __call__(self, out_bgr: np.ndarray, flow_small: np.ndarray | None) -> np.ndarray:
        cur = out_bgr.astype(np.float32)
        if self._prev is None or flow_small is None or self._prev.shape != cur.shape:
            self._prev = cur
            return out_bgr
        h, w = out_bgr.shape[:2]
        mapx, mapy = _flow_maps(flow_small, w, h)
        warped = cv2.remap(self._prev, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        self._prev = _blend_toward_prev(cur, warped, _OUT_LUT)
        return cv2.convertScaleAbs(self._prev)


def adaptive_gamma(frame: np.ndarray) -> float:
    """저조도 프레임을 밝히는 감마를 평균 휘도에서 추정한다 (밝은 영상은 ~1.0)."""
    mean = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean())
    if mean < 1.0:
        return 0.4
    # 평균 휘도를 ~115로 끌어올리는 감마: mean**g = 115
    g = np.log(115.0 / 255.0) / np.log(mean / 255.0)
    return float(np.clip(g, 0.4, 1.0))


class ClaheSmoother:
    """CLAHE 보정량(clahe(L) - L, 픽셀별 float32)을 프레임 사이에 섞는다. 순서대로 렌더할 때만 쓴다.

    CLAHE 타일은 화면에 고정돼 있어 카메라가 움직이면 같은 면 위의 타일별 대비 곡선이 바뀐다.
    그러면 셀 색면이 통째로 한 단계 튄다. 직전 보정량을 광류로 현재 좌표에 옮긴 뒤 EMA로 섞어 줄인다.
    """

    def __init__(self) -> None:
        self.d: np.ndarray | None = None


def _enhance(
    frame: np.ndarray, gamma: float = 1.0, clip: float = 2.0,
    clahe_state: ClaheSmoother | None = None, flow: np.ndarray | None = None,
) -> np.ndarray:
    """저조도 대응 전처리: 감마 리프트 + CLAHE(L채널).

    NlMeans 디노이즈는 이후 bilateral filter + 셀 양자화가 잔여 노이즈를 마저
    뭉개버려 최종 출력에 거의 기여하지 않아 제거함(벤치마크: 프레임당 최대 ~65% 단축).
    감마 LUT는 반올림하고 1.0 미만이면 항상 적용한다 — 예전처럼 0.99 미만에서만 켜고
    소수점을 버리면 감마가 0.99를 넘나들 때 화면 전체가 1~2레벨씩 튀었다.
    CLAHE를 고정 이득 국소 대비로 바꾸는 실험은 어두운 영상의 선명도가 23~59% 떨어져
    폐기했다(2026-11-09 실측).
    `clahe_state`가 있으면 CLAHE 보정량을 직전 프레임의 것(`flow`로 현재 좌표에 옮김)과
    `_CLAHE_SMOOTH_ALPHA`로 섞는다. 직전 상태나 광류가 없으면(첫 프레임) 상태가 없을 때와 결과가 같다.
    """
    if gamma < 1.0:
        lut = np.rint(np.linspace(0, 1, 256) ** gamma * 255).astype(np.uint8)
        frame = cv2.LUT(frame, lut)
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    light, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip, tileGridSize=(8, 8))
    if clahe_state is None:
        light = clahe.apply(light)
    else:
        d = clahe.apply(light).astype(np.float32) - light
        prev = clahe_state.d
        if prev is not None and prev.shape == d.shape and flow is not None:
            h, w = d.shape
            prev = cv2.remap(prev, *_flow_maps(flow, w, h), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            d = prev + _CLAHE_SMOOTH_ALPHA * (d - prev)
        clahe_state.d = d
        light = np.clip(light + d, 0, 255).astype(np.uint8)
    return cv2.cvtColor(cv2.merge([light, a, b]), cv2.COLOR_LAB2BGR)


class CelState:
    """직전 프레임의 셀 단계(픽셀별)를 들고 있다. 영상 변환처럼 프레임을 순서대로 렌더할 때만 쓴다."""

    def __init__(self) -> None:
        self.level: np.ndarray | None = None
        self.held: np.ndarray | None = None  # 직전 단계를 붙잡고 있는 연속 프레임 수

    def warp(self, maps: tuple[np.ndarray, np.ndarray]) -> None:
        """붙잡은 셀 단계가 화면 움직임을 따라가도록 좌표 맵(`_flow_maps`)으로 옮긴다.

        단계는 이산값이라 보간하지 않고 최근접으로 가져온다.
        """
        if self.level is None or self.held is None:
            return
        mapx, mapy = maps
        self.level = cv2.remap(
            self.level.astype(np.float32), mapx, mapy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE
        )
        self.held = cv2.remap(self.held, mapx, mapy, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)


def _cel_quantize(light: np.ndarray, state: CelState | None) -> np.ndarray:
    """L채널을 6단계로 양자화한다. `state`가 있으면 단계 경계에 히스테리시스를 건다.

    바닥·천장처럼 밝기가 완만한 면에서는 L이 1~2만 흔들려도 단계 경계선이 크게 움직여
    색면 모양이 프레임마다 꿈틀댔다(실측: 남은 깜빡임의 55%가 셀 경계). 직전 단계에서
    _CEL_HYSTERESIS 단계 이상 벗어날 때만 단계를 바꾼다. 실제 움직임은 L이 크게 바뀌므로 바로 따라간다.
    붙잡은 단계가 _CEL_HOLD_MAX 프레임을 넘으면 놓아준다 — 물체가 지나간 자리의 배경이 마침 단계
    경계 근처면 물체의 단계가 계속 남아 자국이 생기기 때문이다.
    """
    if state is None:
        return cv2.LUT(np.ascontiguousarray(light), _CEL_LUT)
    x = light.astype(np.float32) * (1.0 / _CEL_STEP)
    level = np.rint(x)
    prev = state.level
    if prev is not None and prev.shape == level.shape and state.held is not None:
        hold = (np.abs(x - prev) < 0.5 + _CEL_HYSTERESIS) & (prev != level) & (state.held < _CEL_HOLD_MAX)
        state.held = np.where(hold, state.held + 1, 0).astype(np.uint8)
        level = np.where(hold, prev, level)
    else:
        state.held = np.zeros(level.shape, np.uint8)
    state.level = level
    out = 0.8 * _CEL_STEP * level + 0.2 * light.astype(np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)  # _CEL_LUT와 같은 버림 — 붙잡지 않은 픽셀은 결과가 같다


def cartoon_frame(
    frame: np.ndarray, gamma: float = 1.0, cel_state: CelState | None = None,
    clahe_state: ClaheSmoother | None = None, flow: np.ndarray | None = None,
) -> np.ndarray:
    """셀 셰이딩 카툰: 저조도 보정 + 적응 채도 + L채널 셀 양자화 + DoG 잉크 라인."""
    h, w = frame.shape[:2]
    den = _enhance(frame, gamma=gamma, clahe_state=clahe_state, flow=flow)

    # 적응 채도: 이미 쨍한 프레임은 덜 올린다
    hsv = cv2.cvtColor(den, cv2.COLOR_BGR2HSV)
    boost = 1.0 + 0.5 * max(0.0, 1.0 - float(hsv[:, :, 1].mean()) / 120.0)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1].astype(np.float32) * boost, 0, 255).astype(np.uint8)
    sat = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    small = cv2.resize(sat, (max(2, w // 2), max(2, h // 2)), interpolation=cv2.INTER_AREA)
    # d=7: bilateral 비용은 d에 급격히 비례한다(half-res 1080x1920 실측 d9 11.0ms / d7 6.6ms /
    # d5 3.1ms). d=9 대비 출력차는 0.58/255(0.23%)에 불과한데, 이 결과는 어차피 업샘플 후
    # 셀 양자화를 거치므로 미세 차이가 더 묻힌다. d=5는 1.23/255로 커져 룩이 흔들릴 여지가 있다.
    small = cv2.bilateralFilter(small, 7, 75, 75)
    # 셀 양자화 전에 중앙값 필터로 잔질감이 만든 작은 얼룩 섬을 주변 면에 흡수시킨다
    # (540p 실측: 면적 80px 미만 셀 조각 582→278개). 원본 해상도 L에 걸면 1080p에서 커널이
    # 11로 커져 15ms가 들어서, 이미 절반으로 줄인 이미지에 해상도 비례 커널로 건다(1080p 0.4ms).
    short_side = min(h, w)
    # 잉크선은 덜 뭉갠 이미지에서 뽑는다 — 색면용 큰 커널을 그대로 쓰면 눈·입 같은 작은 특징의 윤곽이 사라진다
    line_src = cv2.resize(
        cv2.medianBlur(small, _scale_px(_LINE_MEDIAN_K, short_side // 2) | 1), (w, h),
        interpolation=cv2.INTER_LINEAR,
    )
    small = cv2.medianBlur(small, _scale_px(_CEL_MEDIAN_K, short_side // 2) | 1)
    smooth = cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)

    # 셀 셰이딩: L만 6단계 소프트 양자화 (경계 깜빡임·밴딩 완화), 색은 부드럽게 유지.
    # L은 uint8이라 양자화식이 256개 값의 순수 함수 — 전체 이미지를 float32로 올리는 대신
    # 미리 만든 LUT를 태운다(결과 동일, ~63% 단축).
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB)
    lab[:, :, 0] = _cel_quantize(lab[:, :, 0], cel_state)
    cel = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # 잉크 라인: DoG → 이진화 → 소성분 제거 → 군집 억제 → 살짝 두껍게 → 소프트 블렌드.
    # DoG 입력은 색 면과 같은 평활 이미지(`smooth`: bilateral + 중앙값)다. 예전에는 CLAHE로 대비만
    # 키운 `den`에서 바로 뽑아서 보도블록 틈·낙엽 같은 잔질감이 전부 짧은 선 조각이 됐다.
    # DoG 자체는 원본 해상도에서 계산한다 — DoG를 half-res로 계산했던 실험은 텍스트·세부선이
    # 점묘화·단절돼 폐기했다(ponytail: 재시도 시 DoG 계산 해상도는 낮추지 말 것).
    gray = cv2.cvtColor(line_src, cv2.COLOR_BGR2GRAY)
    s = max(1.0, short_side / _DOG_REF_SHORT_SIDE)
    g1 = cv2.GaussianBlur(gray, (0, 0), 1.4 * s)
    # σ=3.0을 원본에서 직접 구하는 대신 g1에 σ=2.65를 덧씌운다 — 가우시안은 합성되므로
    # (1.4² + 2.65² ≈ 3.0²) 결과가 사실상 같고(출력차 0.04/255) 커널이 작아 더 싸다.
    g2 = cv2.GaussianBlur(g1, (0, 0), _DOG_SIGMA2_CASCADE * s)
    dog = cv2.subtract(g1, g2)
    # 선 판정은 전부 연속값이다. 픽셀은 DoG가 _LINE_DOG_LO~HI 사이에서 서서히 진해지고, 조각은
    # 면적·길이·대비·군집 조건 경계 근처에서 서서히 옅어진다. 예전에는 DoG 4 이상만 선으로 칠하고
    # 조각마다 남길지를 0/1로 정해서, 조건 경계에 걸린 선이 프레임마다 깜빡였다.
    cand = cv2.morphologyEx(
        (dog >= _LINE_DOG_LO).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)
    )
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
    # 컴포넌트별 Python 루프(`labels == i`)는 성분 수만큼 전체 이미지를 훑어
    # 1080x1920·성분 800개 기준 프레임당 ~330ms(전체의 60%)를 잡아먹었다.
    # 면적·길이·대비 조건을 라벨 LUT로 바꿔 한 번의 인덱싱으로 처리한다.
    long_side = np.maximum(stats[:, cv2.CC_STAT_WIDTH], stats[:, cv2.CC_STAT_HEIGHT])
    # 조각의 대비는 강한 픽셀 수로 잰다. 최대값 하나로 정하면 그 픽셀 하나가 조각 전체를 켜고 끈다
    strong_px = np.bincount(labels[dog >= _LINE_STRONG_DOG], minlength=n_labels)
    min_len = _scale_px(_LINE_MIN_LEN, short_side)
    min_area = _LINE_MIN_AREA * s * s
    keep = _ramp(stats[:, cv2.CC_STAT_AREA], min_area * 0.6, min_area * 1.4) * np.maximum(
        _ramp(long_side, min_len * 0.7, min_len * 1.3), _ramp(strong_px, 0, 3 * s * s)
    )
    keep[0] = 0.0  # 배경 라벨
    keep = _cluster_weight(keep, labels, stats, short_side)
    line = keep.astype(np.float32)[labels] * _ramp(dog, _LINE_DOG_LO - 0.5, _LINE_DOG_HI)
    k = max(2, round(2 * s))
    line_mask = cv2.dilate(np.rint(line * 255).astype(np.uint8), np.ones((k, k), np.uint8))
    #
    # 소프트 블렌드: numpy 브로드캐스트(uint16) 대신 OpenCV 융합 연산을 쓴다 — numpy는
    # 곱셈/덧셈마다 1080x1920x3 임시 배열을 새로 만드는데 cv2는 SIMD로 한 번에 처리한다
    # (실측 15.9ms → 10.6ms). 반올림 차이로 최대 1레벨 오차가 날 수 있으나 육안 식별 불가.
    alpha = cv2.GaussianBlur(line_mask, (3, 3), 0)
    alpha3 = cv2.merge((alpha, alpha, alpha))
    line_layer = np.empty_like(cel)
    line_layer[:] = _LINE_BGR_U8
    blended = cv2.add(
        cv2.multiply(cel, cv2.bitwise_not(alpha3), dtype=cv2.CV_16U),
        cv2.multiply(line_layer, alpha3, dtype=cv2.CV_16U),
    )
    return cv2.convertScaleAbs(blended, alpha=1.0 / 255.0)


def _worker_init() -> None:
    cv2.setNumThreads(1)


# 영상 전체 샘플로 밝기 기준(lo/hi)을 한 번 계산해 넘겨받는 필터. 둘 다 `orange_cartoon._tone`을 쓴다.
_TONE_RANGE_FILTERS = ("orange_cartoon", "mono_cartoon")

VIDEO_FILTERS = ("cartoon", "sketch", "orange_cartoon", "monet", "mono_cartoon")


def frame_renderer(
    video_filter: str, tone_range: tuple[float, float] | None = None, sequential: bool = False,
):
    """필터 이름 → 프레임 렌더러 `(frame, gamma) -> frame`. `sequential=True`면 `(frame, gamma, flow)`로
    잡음 제거기의 광류(`TemporalDenoiser.flow`)를 더 받는다(모든 필터 공통).

    sketch·orange_cartoon·monet·mono_cartoon 렌더러는 이 모듈의 전처리(`_enhance`)를 import하므로 순환 import를
    피하려고 호출 시점에 가져온다. `sequential=True`는 프레임을 순서대로 렌더하는 구간 경로 전용으로,
    카툰이 직전 셀 단계를 이어받아 경계 꿈틀거림을 줄이고(`_cel_quantize`), 카툰·스케치·모네는
    CLAHE 보정량을 광류로 옮겨 시간 방향으로 평활한다(`ClaheSmoother`). 병렬 풀 경로는 평활하지 않는다.
    `tone_range`는 orange_cartoon·mono_cartoon 전용 인자다 — 영상 전체
    샘플로 미리 계산한 밝기 기준(lo/hi, `orange_cartoon.sample_tone_range`)을 클로저로
    고정해 넘긴다. 다른 필터는 이 인자를 무시한다. 자세한 설계 이유는
    `app.services.orange_cartoon` 모듈 docstring 참고.
    """
    if video_filter == "cartoon":
        if not sequential:
            return cartoon_frame
        # 프레임을 순서대로 렌더하는 경로에서만 직전 셀 단계·CLAHE 보정량을 이어받는다
        state = CelState()
        smoother = ClaheSmoother()

        def _render_cartoon(frame: np.ndarray, gamma: float = 1.0, flow: np.ndarray | None = None) -> np.ndarray:
            # 광류가 있으면 붙잡은 셀 단계를 먼저 현재 좌표로 옮겨, 카메라가 움직여도 히스테리시스가 이어진다
            if flow is not None and state.level is not None:
                h, w = frame.shape[:2]
                state.warp(_flow_maps(flow, w, h))
            return cartoon_frame(frame, gamma, cel_state=state, clahe_state=smoother, flow=flow)

        return _render_cartoon
    if video_filter == "sketch":
        from app.services.sketch import sketch_frame

        if not sequential:
            return sketch_frame
        sketch_smoother = ClaheSmoother()

        def _render_sketch(frame: np.ndarray, gamma: float = 1.0, flow: np.ndarray | None = None) -> np.ndarray:
            return sketch_frame(frame, gamma, clahe_state=sketch_smoother, flow=flow)

        return _render_sketch
    if video_filter == "orange_cartoon":
        from app.services.orange_cartoon import orange_cartoon_frame

        def _render(frame: np.ndarray, gamma: float = 1.0, flow: np.ndarray | None = None) -> np.ndarray:
            return orange_cartoon_frame(frame, gamma, tone_range=tone_range)

        return _render
    if video_filter == "monet":
        from app.services.monet import monet_frame

        if not sequential:
            return monet_frame
        monet_smoother = ClaheSmoother()

        def _render_monet(frame: np.ndarray, gamma: float = 1.0, flow: np.ndarray | None = None) -> np.ndarray:
            return monet_frame(frame, gamma, clahe_state=monet_smoother, flow=flow)

        return _render_monet
    if video_filter == "mono_cartoon":
        from app.services.mono_cartoon import mono_cartoon_frame

        def _render_mono(frame: np.ndarray, gamma: float = 1.0, flow: np.ndarray | None = None) -> np.ndarray:
            return mono_cartoon_frame(frame, gamma, tone_range=tone_range)

        return _render_mono
    raise ValueError(f"unknown video filter: {video_filter}")


def _render_one(args: tuple[np.ndarray, float, str, tuple[float, float] | None]) -> np.ndarray:
    frame, gamma, video_filter, tone_range = args
    return frame_renderer(video_filter, tone_range)(frame, gamma)


def _sample_gamma(frame: np.ndarray, gamma_ema: float | None, frame_idx: int) -> float:
    """감마를 `_GAMMA_SAMPLE_EVERY` 프레임마다만 재계산하고 EMA로 스무딩한다.

    `adaptive_gamma`는 프레임 전체를 그레이로 변환해 평균을 내므로 공짜가 아닌데,
    노출은 연속적으로 변하고 EMA가 이미 스무딩하고 있어 매 프레임 잴 필요가 없다.
    (샘플링 주기가 길어진 만큼 EMA 추종이 느려지는데, 이는 깜빡임 억제에 오히려 유리하다.)
    """
    if gamma_ema is not None and frame_idx % _GAMMA_SAMPLE_EVERY:
        return gamma_ema
    g = adaptive_gamma(frame)
    return g if gamma_ema is None else 0.9 * gamma_ema + 0.1 * g


def _plan_segments(frame_count: int, k: int) -> list[tuple[int, int, int]]:
    """frame_count를 k개 구간 (start, end, pad_start)로 분할. 나머지 프레임은 마지막 구간이 흡수.

    pad_start: 이 구간이 실제로 쓰기 시작하는 start보다 앞서 읽기 시작하는 지점(예열용).
    0번 구간은 원래도 처음부터 시작이라 예열이 필요 없다.
    """
    if k <= 1:
        return [(0, frame_count, 0)]
    base = frame_count // k
    segments: list[tuple[int, int, int]] = []
    start = 0
    for i in range(k):
        end = frame_count if i == k - 1 else start + base
        pad_start = 0 if i == 0 else max(0, start - _SEG_PAD_FRAMES)
        segments.append((start, end, pad_start))
        start = end
    return segments


def _segment_gamma_states(
    input_path: str, starts: list[int], out_w: int, out_h: int,
) -> dict[int, float | None]:
    """구간 읽기 시작 직전의 감마 상태를 순차 경로와 정확히 같게 계산한다.

    60프레임 예열 뒤에도 초기값 오차의 0.9**12가 남는다. 샘플 프레임만
    변환하는 선행 패스에서 상태를 넘겨 병렬 수·구간 시작 위치에 따른 밝기 차이를 없앤다.
    """
    states: dict[int, float | None] = {0: None}
    pending = set(starts) - {0}
    if not pending:
        return states
    cap = cv2.VideoCapture(input_path)
    gamma: float | None = None
    last = max(pending)
    try:
        for idx in range(last + 1):
            if idx in pending:
                states[idx] = gamma
            if idx == last:
                break
            if not cap.grab():
                raise ValueError("cannot decode gamma prepass")
            if idx % _GAMMA_SAMPLE_EVERY == 0:
                ok, frame = cap.retrieve()
                if not ok:
                    raise ValueError("cannot retrieve gamma sample")
                if (frame.shape[1], frame.shape[0]) != (out_w, out_h):
                    frame = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)
                gamma = _sample_gamma(frame, gamma, idx)
        return states
    finally:
        cap.release()


def _render_cartoon_segment(args: tuple) -> tuple[int, str]:
    """구간 하나를 카툰 변환해 비디오 전용(오디오 없음) mp4로 저장. (프레임 수, seg_path) 반환.

    선행 패스의 감마 상태를 이어받아 pad_start부터 읽고 start 이후 프레임만 쓴다.
    샘플링은 영상의 절대 프레임 번호를 사용해 순차 처리와 같은 EMA를 유지한다. orange_cartoon의
    밝기 기준(`tone_range`)은 감마와 달리 영상 전체에서 미리 계산해 넘긴 고정값이라
    구간마다 다시 추정하지 않는다.
    """
    input_path, start, end, pad_start, out_w, out_h, fps, seg_path, video_filter, tone_range, gamma_seed = args
    render = frame_renderer(video_filter, tone_range, sequential=True)
    cv2.setNumThreads(1)
    # x264 -threads auto는 코어당 ~1.5개 프레임 스레드를 띄운다. 구간마다 인코더가 하나씩
    # 떠서(k개) 렌더 프로세스 수와 별개로 코어를 오버섭스크립션한다 — 2로 고정.

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"cannot open video: {input_path}")
    if pad_start > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, pad_start)

    # -crf 28: worker의 compress 단계와 같은 목표 화질/용량 — video_filter 지정 시 compress를
    # 건너뛰고 이 인코더가 직접 최종 결과물을 만들기 때문(이중 인코딩 제거, full_pipeline_multi.py).
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{out_w}x{out_h}",
        "-r", f"{fps:.6f}", "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "28", "-threads", "2",
        "-movflags", "+faststart",
        seg_path,
    ]
    proc = subprocess.Popen(
        ffmpeg_cmd, stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    assert proc.stdin is not None

    stderr_chunks: list[bytes] = []

    def _drain_stderr() -> None:
        assert proc.stderr is not None
        for chunk in iter(lambda: proc.stderr.read(4096), b""):
            stderr_chunks.append(chunk)

    stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
    stderr_thread.start()

    processed = 0
    gamma_ema: float | None = gamma_seed
    denoise = TemporalDenoiser()
    stab = OutputStabilizer()
    frame_idx = pad_start
    try:
        while frame_idx < end:
            ok, frame = cap.read()
            if not ok:
                break
            if (frame.shape[1], frame.shape[0]) != (out_w, out_h):
                frame = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)
            gamma_ema = _sample_gamma(frame, gamma_ema, frame_idx)
            # 예열 구간에서도 돌려야 구간 시작 시점에 잡음 제거 상태가 수렴해 있다
            frame = denoise(frame)
            flow = denoise.flow
            if frame_idx >= start:
                out = stab(render(frame, gamma_ema, flow=flow), flow)
                proc.stdin.write(out.tobytes())
                processed += 1
            elif frame_idx >= start - _SEQ_WARMUP_FRAMES and pad_start < start:
                # 셀 히스테리시스·CLAHE 평활·출력 안정화 상태 예열(출력하지 않는다). 안정화기는 순서대로 먹여야 수렴한다
                stab(render(frame, gamma_ema, flow=flow), flow)
            frame_idx += 1
    finally:
        cap.release()
        proc.stdin.close()
        code = proc.wait()
        stderr_thread.join(timeout=5)

    if code != 0:
        stderr = b"".join(stderr_chunks).decode(errors="replace")
        raise RuntimeError(f"ffmpeg encode failed (exit {code}): {stderr[-500:]}")
    if processed != end - start:
        raise ValueError(f"segment frame mismatch: expected {end - start}, got {processed}")
    return processed, seg_path


def _concat_and_mux(seg_paths: list[str], input_path: str, output_path: str) -> None:
    """구간 mp4들을 무손실로 이어붙이고(-c:v copy) 원본 오디오를 한 번만 입힌다."""
    concat_list = output_path + ".concat.txt"
    with open(concat_list, "w") as f:
        for p in seg_paths:
            f.write(f"file '{p}'\n")
    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", concat_list,
            "-i", input_path,
            "-map", "0:v", "-map", "1:a?",
            "-c:v", "copy", "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")
            raise RuntimeError(f"concat mux failed (exit {result.returncode}): {stderr[-500:]}")
    finally:
        try:
            os.remove(concat_list)
        except OSError:
            pass


def cartoonize_video(input_path: str, output_path: str) -> None:
    """영상 전체를 카툰 변환한다. `filter_video(..., "cartoon")`과 같다."""
    filter_video(input_path, output_path, "cartoon")


_TONE_SAMPLE_FRAMES = 10  # 균등 간격 8~12장 — 영상 전체 밝기 기준(lo/hi)을 한 번만 잰다


def _sample_video_tone_range(input_path: str, frame_count: int) -> tuple[float, float] | None:
    """orange_cartoon·mono_cartoon 전용: 영상 전체에서 균등 간격 프레임을 뽑아 밝기 기준(lo/hi 백분위)을
    한 번만 계산한다. 구간 병렬 렌더링에 모두 같은 값을 넘겨 톤이 구간 경계에서 끊기거나
    프레임마다 깜빡이지 않게 한다 — 설계 이유는 `app.services.orange_cartoon` 모듈 docstring
    참고. 프레임을 하나도 못 읽으면 None(호출부가 프레임별 폴백을 쓴다).
    """
    if frame_count <= 0:
        return None
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        return None
    try:
        n = min(_TONE_SAMPLE_FRAMES, frame_count)
        frames = []
        for i in range(n):
            idx = int(i * frame_count / n)
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ok, frame = cap.read()
            if ok:
                frames.append(frame)
        if not frames:
            return None
        from app.services.orange_cartoon import sample_tone_range

        return sample_tone_range(frames)
    finally:
        cap.release()


def filter_video(input_path: str, output_path: str, video_filter: str) -> None:
    """영상 전체에 `video_filter`(cartoon·sketch·orange_cartoon·monet·mono_cartoon) 렌더러를 적용한다. 원본
    오디오 스트림은 그대로 보존(-c:a copy).

    프레임 수가 `_MIN_SEGMENT_FRAMES` 이상이면 영상을 `_worker_pool_size()`개 구간으로 나눠
    프로세스 풀로 병렬 렌더링한다 — 카툰 변환은 프레임 단위로 독립적이라 구간별로 디코딩·렌더링·
    인코딩을 통째로 병렬화할 수 있고, 그러면 부모 프로세스가 홀로 하던 디코딩과 raw 파이프
    쓰기(1080x1920 기준 프레임당 6.2MB)까지 함께 분산된다.
    짧은 영상은 구간 분할 실익이 없어 기존 프레임 단위 병렬 경로를 그대로 쓴다.
    두 경로 모두 입력에는 광류 보정 시간 잡음 제거, 출력에는 `OutputStabilizer`를 순서대로 건다
    (구간 경로는 카툰 셀 단계도 광류로 옮긴다. 프레임 병렬 경로는 풀이 상태를 갖지 않아 셀 이동이 없다).
    """
    frame_renderer(video_filter)  # 알 수 없는 필터는 디코딩 전에 거른다
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"cannot open video: {input_path}")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    # yuv420p는 짝수 해상도 필요
    out_w, out_h = w - w % 2, h - h % 2
    if out_w < 2 or out_h < 2:
        cap.release()
        raise ValueError(f"video too small: {w}x{h}")
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    # orange_cartoon·mono_cartoon만 영상 전체 샘플로 밝기 기준을 한 번 정하고 모든 구간에 그대로 넘긴다
    # (자세한 이유는 `_sample_video_tone_range`·`app.services.orange_cartoon` docstring).
    # cartoon·sketch는 프레임별 감마 EMA만으로 충분해 이 값을 쓰지 않는다.
    tone_range = (
        _sample_video_tone_range(input_path, frame_count) if video_filter in _TONE_RANGE_FILTERS else None
    )

    # 컨테이너가 프레임 수를 신뢰할 수 없게 보고하면(0 이하) 안전하게 프레임 병렬로 폴백.
    k = min(_worker_pool_size(), max(1, frame_count // _MIN_SEGMENT_FRAMES)) if frame_count > 0 else 1
    if k <= 1:
        _cartoonize_frame_parallel(input_path, output_path, out_w, out_h, fps, video_filter, tone_range)
        return

    try:
        segments = _plan_segments(frame_count, k)
        gamma_states = _segment_gamma_states(input_path, [p for _, _, p in segments], out_w, out_h)
        with tempfile.TemporaryDirectory() as tmpdir:
            seg_args = [
                (input_path, start, end, pad_start, out_w, out_h, fps,
                 os.path.join(tmpdir, f"seg_{i}.mp4"), video_filter, tone_range, gamma_states[pad_start])
                for i, (start, end, pad_start) in enumerate(segments)
            ]
            pool = mp.get_context("spawn").Pool(k)
            try:
                results = pool.map(_render_cartoon_segment, seg_args)
            finally:
                pool.terminate()
                pool.join()
            _concat_and_mux([p for _, p in results], input_path, output_path)
    except Exception:
        # 구간 분할은 컨테이너가 보고한 프레임 수에 의존한다 — 값이 부정확하면 구간이
        # 어긋나 실패한다. 프레임 병렬 경로는 EOF까지 읽으므로 그 영향을 받지 않는다.
        # 잡 전체를 실패시키는 대신 느리지만 확실한 경로로 되돌린다.
        logger.warning(
            "filter_video(%s): 구간 병렬 실패 → 프레임 병렬로 폴백 (frames=%d, k=%d)",
            video_filter, frame_count, k, exc_info=True,
        )
        _cartoonize_frame_parallel(input_path, output_path, out_w, out_h, fps, video_filter, tone_range)
        return

    processed = sum(n for n, _ in results)
    logger.info(
        "filter_video(%s): %d frames in %d segments → %s",
        video_filter, processed, len(segments), output_path,
    )


def _cartoonize_frame_parallel(
    input_path: str, output_path: str, out_w: int, out_h: int, fps: float,
    video_filter: str = "cartoon", tone_range: tuple[float, float] | None = None,
) -> None:
    """짧은 영상용 경로: 프레임을 프로세스 풀로 병렬 렌더링하고 단일 ffmpeg로 인코딩한다.

    ffmpeg 2입력(raw 비디오 파이프 + 원본 파일의 오디오)으로 재합성한다.
    오디오가 없는 입력도 동작한다(1:a?).
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"cannot open video: {input_path}")

    # -threads 2: 이 경로는 아래에서 _worker_pool_size()개 렌더 프로세스를 동시에 띄운다
    # (구간 병렬과 동일한 오버섭스크립션 — x264 auto는 코어당 ~1.5스레드).
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{out_w}x{out_h}",
        "-r", f"{fps:.6f}", "-i", "-",
        "-i", input_path,
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "28", "-threads", "2",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path,
    ]
    proc = subprocess.Popen(
        ffmpeg_cmd, stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    assert proc.stdin is not None

    # stderr를 계속 읽어 비워두지 않으면 ffmpeg 로그로 파이프 버퍼가 차서 ffmpeg가 멈추고,
    # 그러면 아래 stdin.write()도 함께 블로킹되어 영구 교착 상태에 빠진다.
    stderr_chunks: list[bytes] = []

    def _drain_stderr() -> None:
        assert proc.stderr is not None
        for chunk in iter(lambda: proc.stderr.read(4096), b""):
            stderr_chunks.append(chunk)

    stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
    stderr_thread.start()

    processed = 0
    read_idx = 0
    gamma_ema: float | None = None
    denoise = TemporalDenoiser()
    stab = OutputStabilizer()
    pool = mp.get_context("spawn").Pool(_worker_pool_size(), initializer=_worker_init)
    try:
        while True:
            batch: list[tuple[np.ndarray, float, str, tuple[float, float] | None]] = []
            flows: list[np.ndarray | None] = []  # 배치 항목별 작은 광류(약 1MB) — 풀이 아니라 메인에서 출력 안정화에 쓴다
            while len(batch) < _CHUNK:
                ok, frame = cap.read()
                if not ok:
                    break
                if (frame.shape[1], frame.shape[0]) != (out_w, out_h):
                    frame = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)
                # 감마 EMA: 프레임별 노출 변화로 밝기가 깜빡이지 않게 스무딩
                gamma_ema = _sample_gamma(frame, gamma_ema, read_idx)
                read_idx += 1
                batch.append((denoise(frame), gamma_ema, video_filter, tone_range))
                flows.append(denoise.flow)
            if not batch:
                break
            for canvas, flow in zip(pool.map(_render_one, batch), flows):
                proc.stdin.write(stab(canvas, flow).tobytes())
                processed += 1
    finally:
        pool.terminate()
        pool.join()
        cap.release()
        proc.stdin.close()
        code = proc.wait()
        stderr_thread.join(timeout=5)

    if code != 0:
        stderr = b"".join(stderr_chunks).decode(errors="replace")
        raise RuntimeError(f"ffmpeg encode failed (exit {code}): {stderr[-500:]}")
    if processed == 0:
        raise ValueError("no frames decoded from input video")
    logger.info("filter_video(%s): %d frames → %s", video_filter, processed, output_path)
