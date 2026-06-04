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


@pytest.mark.skipif(not TEST_VIDEO.exists(), reason="subtitle test video missing")
def test_generate_subtitle_for_video_uses_real_video_and_uploads_clamped_srt() -> None:
    from tasks.subtitle import generate_subtitle_for_video

    fake_r2 = FakeR2(TEST_VIDEO.read_bytes())

    with patch("tasks.subtitle._transcribe_srt", return_value=(SAMPLE_SRT, 0.123)) as transcribe:
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
