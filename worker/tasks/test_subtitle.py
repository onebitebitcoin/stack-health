from __future__ import annotations

import io
import json
from pathlib import Path
from unittest.mock import patch

import pytest


ROOT = Path(__file__).resolve().parents[2]
TEST_VIDEO = ROOT / "subtitle-test" / "source.mp4"
SAMPLE_SRT = """1
00:00:00,000 --> 00:00:08,440
오늘도 5킬로 뛰었고, 한 30분 좀 넘었네요.

2
00:00:20,719 --> 00:00:24,559
그럼 모두들 화이팅 하세요. 화이팅!
"""


class FakeR2:
    def __init__(self, video_bytes: bytes) -> None:
        self.video_bytes = video_bytes
        self.puts: list[dict] = []

    def get_object(self, **kwargs):
        assert kwargs["Key"] == "videos/source.mp4"
        return {"Body": io.BytesIO(self.video_bytes)}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        return {}


SAMPLE_VERBOSE_RESPONSE = {
    "language": "ko",
    "segments": [
        {
            "id": 0, "start": 0.0, "end": 8.44,
            "text": " 오늘도 5킬로 뛰었고, 한 30분 좀 넘었네요.",
            "no_speech_prob": 0.01, "avg_logprob": -0.2, "compression_ratio": 1.1,
        },
        {
            "id": 1, "start": 20.719, "end": 24.559,
            "text": " 그럼 모두들 화이팅 하세요. 화이팅!",
            "no_speech_prob": 0.02, "avg_logprob": -0.15, "compression_ratio": 1.0,
        },
    ],
}


@pytest.mark.skipif(not TEST_VIDEO.exists(), reason="subtitle test video missing")
def test_generate_subtitle_for_video_uses_real_video_and_uploads_clamped_srt() -> None:
    from tasks.subtitle import generate_subtitle_for_video

    fake_r2 = FakeR2(TEST_VIDEO.read_bytes())

    with patch("tasks.subtitle._transcribe_verbose_json", return_value=(SAMPLE_VERBOSE_RESPONSE, 0.123)) as transcribe:
        result = generate_subtitle_for_video(fake_r2, "videos/source.mp4", api_key="test-key")

    assert result.status == "completed"
    assert result.subtitle_r2_key and result.subtitle_r2_key.startswith("subtitles/s-")
    assert result.subtitle_url and result.subtitle_url.endswith(result.subtitle_r2_key)
    assert result.burned_video_r2_key and result.burned_video_r2_key.startswith("videos/subtitled-")
    assert result.burned_video_url and result.burned_video_url.endswith(result.burned_video_r2_key)
    assert result.subtitle_text == "오늘도 5킬로 뛰었고, 한 30분 좀 넘었네요. 그럼 모두들 화이팅 하세요. 화이팅!"
    assert result.metrics is not None
    assert result.metrics["duration_sec"] == pytest.approx(23.871, abs=0.05)
    assert result.metrics["extract_audio_seconds"] >= 0
    assert result.metrics["transcribe_seconds"] == pytest.approx(0.123)
    assert result.metrics["srt_clamped_to_source_duration"] is True
    assert result.metrics["burn_in_required"] is True
    assert result.metrics["burn_in_back_opacity"] == 0.8
    assert result.metrics["burn_in_seconds"] >= 0
    assert len(fake_r2.puts) == 2
    uploaded = fake_r2.puts[0]
    assert uploaded["Key"].endswith(".vtt")
    assert uploaded["ContentType"].startswith("text/vtt")
    vtt_text = uploaded["Body"].decode("utf-8")
    assert vtt_text.startswith("WEBVTT")
    assert "00:00:20.719 --> 00:00:23.871" in vtt_text
    burned = fake_r2.puts[1]
    assert burned["Key"].startswith("videos/subtitled-")
    assert burned["Key"].endswith(".mp4")
    assert burned["ContentType"] == "video/mp4"
    assert hasattr(burned["Body"], "read")
    transcribe.assert_called_once()


def test_generate_subtitle_for_video_skips_without_api_key(monkeypatch) -> None:
    from tasks.subtitle import generate_subtitle_for_video

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    fake_r2 = FakeR2(b"not-used")

    result = generate_subtitle_for_video(fake_r2, "videos/source.mp4")

    assert result.status == "skipped"
    assert "OPENAI_API_KEY" in (result.error or "")
    assert fake_r2.puts == []


def test_plain_text_and_metrics_json_helpers() -> None:
    from tasks.subtitle import SubtitleResult, subtitle_metrics_json

    result = SubtitleResult(status="completed", metrics={"language": "ko", "seconds": 1.5})

    assert json.loads(subtitle_metrics_json(result) or "{}") == {"language": "ko", "seconds": 1.5}


def test_detect_silence_ranges_parses_ffmpeg_silencedetect_output() -> None:
    from tasks.subtitle import _detect_silence_ranges

    fake_stderr = (
        "[silencedetect @ 0x1] silence_start: 0\n"
        "[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 2.5\n"
        "[silencedetect @ 0x1] silence_start: 18.2\n"
    )
    fake_result = type("R", (), {"stderr": fake_stderr, "returncode": 0})()

    with patch("tasks.subtitle.subprocess.run", return_value=fake_result) as run:
        ranges = _detect_silence_ranges("audio.m4a", duration=24.0)

    run.assert_called_once()
    assert ranges == [(0.0, 2.5), (18.2, 24.0)]


def test_detect_silence_ranges_returns_empty_on_failure() -> None:
    from tasks.subtitle import _detect_silence_ranges

    with patch("tasks.subtitle.subprocess.run", side_effect=OSError("boom")):
        assert _detect_silence_ranges("audio.m4a", duration=10.0) == []


def test_filter_srt_by_silence_drops_cues_inside_silent_ranges() -> None:
    from tasks.subtitle import _filter_srt_by_silence

    srt_text = (
        "1\n00:00:00,000 --> 00:00:08,440\n"
        "오늘도 5킬로 뛰었고, 한 30분 좀 넘었네요.\n"
        "\n"
        "2\n00:00:20,000 --> 00:00:23,871\n"
        "시청해주셔서 감사합니다.\n"
    )

    filtered, dropped = _filter_srt_by_silence(srt_text, [(8.5, 23.871)])

    assert dropped == 1
    assert "시청해주셔서 감사합니다" not in filtered
    assert "오늘도 5킬로 뛰었고" in filtered
    assert filtered.lstrip().startswith("1\n")


def test_filter_srt_by_silence_keeps_cues_outside_silence_or_when_none_detected() -> None:
    from tasks.subtitle import _filter_srt_by_silence

    srt_text = "1\n00:00:00,000 --> 00:00:08,440\n오늘도 5킬로 뛰었고.\n"

    unchanged, dropped_a = _filter_srt_by_silence(srt_text, [])
    assert (unchanged, dropped_a) == (srt_text, 0)

    kept, dropped_b = _filter_srt_by_silence(srt_text, [(100.0, 110.0)])
    assert dropped_b == 0
    assert "오늘도 5킬로 뛰었고" in kept


def test_transcribe_srt_sends_prompt_and_temperature(monkeypatch) -> None:
    from tasks import subtitle

    captured: dict = {}

    def fake_encode_multipart(fields, file_field, file_path):
        captured["fields"] = fields
        return b"body", "boundary"

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self):
            return b"1\n00:00:00,000 --> 00:00:01,000\nhi\n"

    monkeypatch.setattr(subtitle, "_encode_multipart", fake_encode_multipart)
    monkeypatch.setattr(subtitle.urllib.request, "Request", lambda *a, **k: object())
    monkeypatch.setattr(subtitle.urllib.request, "urlopen", lambda *a, **k: FakeResponse())

    subtitle._transcribe_srt(
        "audio.m4a",
        api_key="test-key",
        model="whisper-1",
        language="ko",
        prompt="이것은 운동 기록 음성입니다.",
        temperature=0.0,
    )

    assert captured["fields"]["prompt"] == "이것은 운동 기록 음성입니다."
    assert captured["fields"]["temperature"] == "0.0"


# ──────────────────────────────────────────────
# 언어 분기 테스트 (태스크 #2)
# ──────────────────────────────────────────────

def test_chars_per_sec_threshold_returns_higher_for_en() -> None:
    """영어 임계치는 한국어 임계치보다 높아야 한다 (~2.5x)."""
    from tasks.subtitle import _chars_per_sec_threshold, SUBTITLE_MIN_CHARS_PER_SEC, SUBTITLE_MIN_CHARS_PER_SEC_EN

    ko_threshold = _chars_per_sec_threshold("ko")
    en_threshold = _chars_per_sec_threshold("en")
    auto_ko_threshold = _chars_per_sec_threshold("auto", detected_language="ko")
    auto_en_threshold = _chars_per_sec_threshold("auto", detected_language="en")
    auto_no_detect = _chars_per_sec_threshold("auto", detected_language=None)

    assert ko_threshold == SUBTITLE_MIN_CHARS_PER_SEC
    assert en_threshold == SUBTITLE_MIN_CHARS_PER_SEC_EN
    assert en_threshold > ko_threshold
    assert auto_ko_threshold == SUBTITLE_MIN_CHARS_PER_SEC
    assert auto_en_threshold == SUBTITLE_MIN_CHARS_PER_SEC_EN
    # auto with no detected language falls back to Korean threshold
    assert auto_no_detect == SUBTITLE_MIN_CHARS_PER_SEC


def test_segments_to_srt_drops_english_hallucination_phrases() -> None:
    """영어 환각 상용구는 language='en' 설정 시 차단된다."""
    from tasks.subtitle import _segments_to_srt

    segments = [
        {
            # hallucination phrase → must be dropped
            "id": 0, "start": 0.0, "end": 3.0,
            "text": "Thanks for watching",
            "no_speech_prob": 0.01, "avg_logprob": -0.2, "compression_ratio": 1.1,
        },
        {
            # 33 chars / 2s = 16.5 cps → well above en threshold (5.0) → kept
            "id": 1, "start": 3.0, "end": 5.0,
            "text": "I just ran five kilometres today.",
            "no_speech_prob": 0.01, "avg_logprob": -0.1, "compression_ratio": 1.0,
        },
    ]

    srt = _segments_to_srt(segments, 0.45, -0.75, language="en")

    assert "Thanks for watching" not in srt
    assert "I just ran five kilometres" in srt


def test_segments_to_srt_drops_korean_hallucination_phrases() -> None:
    """한국어 환각 상용구는 language='ko' 설정 시 차단된다."""
    from tasks.subtitle import _segments_to_srt

    segments = [
        {
            # hallucination phrase → must be dropped
            "id": 0, "start": 0.0, "end": 4.0,
            "text": "시청해주셔서 감사합니다",
            "no_speech_prob": 0.01, "avg_logprob": -0.2, "compression_ratio": 1.1,
        },
        {
            # 12 chars / 3s = 4.0 cps → above ko threshold (2.0) → kept
            "id": 1, "start": 4.0, "end": 7.0,
            "text": "오늘도 완주했습니다",
            "no_speech_prob": 0.01, "avg_logprob": -0.1, "compression_ratio": 1.0,
        },
    ]

    srt = _segments_to_srt(segments, 0.45, -0.75, language="ko")

    assert "시청해주셔서 감사합니다" not in srt
    assert "오늘도 완주했습니다" in srt


def test_segments_to_srt_drops_comma_separated_subscribe_hallucination() -> None:
    """쉼표/조사로 분리된 환각('구독, 좋아요, 댓글')도 토큰 동시출현으로 차단된다.

    video 227 회귀: '구독과 좋아요' 연속 문자열이 없어 기존 부분일치 필터를
    통과해 burn-in 되었던 정확한 문구다.
    """
    from tasks.subtitle import _segments_to_srt

    segments = [
        {
            "id": 0, "start": 0.0, "end": 12.0,
            "text": "영상이 도움이 되셨다면 구독, 좋아요, 댓글 부탁드립니다.",
            "no_speech_prob": 0.01, "avg_logprob": -0.2, "compression_ratio": 1.1,
        },
        {
            "id": 1, "start": 12.0, "end": 15.0,
            "text": "오늘도 완주했습니다",
            "no_speech_prob": 0.01, "avg_logprob": -0.1, "compression_ratio": 1.0,
        },
    ]

    srt = _segments_to_srt(segments, 0.45, -0.75, language="ko")

    assert "구독" not in srt
    assert "좋아요" not in srt
    assert "오늘도 완주했습니다" in srt


def test_segments_to_srt_en_applies_higher_chars_per_sec() -> None:
    """영어는 높은 chars_per_sec 임계치로 짧은 세그먼트를 더 엄격하게 필터링한다."""
    from tasks.subtitle import _segments_to_srt

    # "Hello" = 5 chars / 3s = 1.67 cps
    # → above ko threshold (2.0)? No, 1.67 < 2.0 → also filtered by ko
    # Use a segment that passes ko but fails en:
    # "Good" = 4 chars / 1s = 4.0 cps → passes ko(2.0), fails en(5.0)
    segments = [
        {
            "id": 0, "start": 0.0, "end": 1.0,
            "text": "Good",  # 4 cps → passes ko(2.0), blocked by en(5.0)
            "no_speech_prob": 0.01, "avg_logprob": -0.2, "compression_ratio": 1.0,
        },
    ]

    srt_ko = _segments_to_srt(segments, 0.45, -0.75, language="ko")
    srt_en = _segments_to_srt(segments, 0.45, -0.75, language="en")

    assert "Good" in srt_ko   # 4.0 cps >= ko threshold (2.0) → passes
    assert "Good" not in srt_en  # 4.0 cps < en threshold (5.0) → blocked


def test_segments_to_srt_auto_language_uses_detected_language() -> None:
    """'auto' 언어는 Whisper가 감지한 언어 기반으로 임계치를 적용한다."""
    from tasks.subtitle import _segments_to_srt

    # "Good" = 4 chars / 1s = 4.0 cps → passes ko(2.0), blocked by en(5.0)
    segments = [
        {
            "id": 0, "start": 0.0, "end": 1.0,
            "text": "Good",
            "no_speech_prob": 0.01, "avg_logprob": -0.2, "compression_ratio": 1.0,
        },
    ]

    # auto + detected=en → en threshold (5.0) → blocked
    srt_auto_en = _segments_to_srt(segments, 0.45, -0.75, language="auto", detected_language="en")
    assert "Good" not in srt_auto_en

    # auto + detected=ko → ko threshold (2.0) → passes
    srt_auto_ko = _segments_to_srt(segments, 0.45, -0.75, language="auto", detected_language="ko")
    assert "Good" in srt_auto_ko
