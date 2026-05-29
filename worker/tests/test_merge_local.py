"""
로컬 ffmpeg 기반 merge 파이프라인 테스트.
R2 없이 테스트 파일을 생성해서 ffmpeg 명령을 직접 검증한다.

테스트 케이스:
1. image + video merge  (proof_merge: 이미지를 3초 클립으로 변환 후 concat)
2. image + video + audio merge (audio merge 후 proof_merge)
"""

import os
import subprocess
import tempfile

# ── 테스트 픽스처 생성 ─────────────────────────────────────────────────────────


def _make_tmp(suffix: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        return f.name


def _generate_test_video(path: str, width: int = 720, height: int = 1280, duration: int = 5) -> None:
    """ffmpeg으로 컬러바 테스트 영상 생성 (오디오 없음)."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"testsrc=size={width}x{height}:rate=30:duration={duration}",
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-an", "-movflags", "+faststart",
            path,
        ],
        capture_output=True,
        timeout=30,
    )
    assert result.returncode == 0, f"테스트 영상 생성 실패:\n{result.stderr.decode()}"


def _generate_test_video_with_audio(
    path: str, width: int = 720, height: int = 1280, duration: int = 5
) -> None:
    """오디오 포함 테스트 영상 생성."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"testsrc=size={width}x{height}:rate=30:duration={duration}",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
            path,
        ],
        capture_output=True,
        timeout=30,
    )
    assert result.returncode == 0, f"테스트 영상(오디오포함) 생성 실패:\n{result.stderr.decode()}"


def _generate_test_image(path: str, width: int = 720, height: int = 1280) -> None:
    """ffmpeg으로 컬러 테스트 이미지 생성."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"color=c=blue:size={width}x{height}:duration=1:rate=1",
            "-vframes", "1",
            path,
        ],
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, f"테스트 이미지 생성 실패:\n{result.stderr.decode()}"


def _generate_test_audio(path: str, duration: int = 5) -> None:
    """ffmpeg으로 sine 테스트 오디오 생성."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", f"sine=frequency=440:duration={duration}",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            path,
        ],
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, f"테스트 오디오 생성 실패:\n{result.stderr.decode()}"


def _probe_streams(path: str) -> dict:
    """ffprobe로 영상/오디오 스트림 정보 반환."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_streams",
            "-of", "json",
            path,
        ],
        capture_output=True, text=True, timeout=15,
    )
    assert result.returncode == 0, f"ffprobe 실패:\n{result.stderr}"
    import json
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    return {
        "has_video": any(s["codec_type"] == "video" for s in streams),
        "has_audio": any(s["codec_type"] == "audio" for s in streams),
        "duration": float(next(
            (s.get("duration", "0") for s in streams if s["codec_type"] == "video"), "0"
        )),
        "width": next((s.get("width") for s in streams if s["codec_type"] == "video"), None),
        "height": next((s.get("height") for s in streams if s["codec_type"] == "video"), None),
    }


# ── 핵심 merge 로직 (R2 제거, 로컬 파일 경로로 동일 ffmpeg 명령 실행) ─────────


def _run_image_video_merge(tmp_video: str, tmp_image: str, tmp_output: str) -> None:
    """
    proof_merge와 동일한 로직: 이미지를 3초 클립으로 변환 후 원본 영상에 concat.
    """
    tmp_proof_clip = _make_tmp(".mp4")
    tmp_list = _make_tmp(".txt")

    try:
        # 원본 영상 크기 확인
        probe_v = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-of", "csv=p=0", tmp_video,
            ],
            capture_output=True, text=True, timeout=30,
        )
        first_line = probe_v.stdout.strip().splitlines()[0] if probe_v.stdout.strip() else ""
        dims = first_line.split(",")
        vw = dims[0].strip() if len(dims) >= 2 else "720"
        vh = dims[1].strip() if len(dims) >= 2 else "1280"

        # 오디오 스트림 확인
        probe_a = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-select_streams", "a:0",
                "-show_entries", "stream=codec_type", "-of", "csv=p=0", tmp_video,
            ],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool(probe_a.stdout.strip())

        vf = (
            f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
            f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
        )

        # 이미지 → 3초 클립
        if has_audio:
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-f", "lavfi", "-t", "3", "-i", "anullsrc=r=48000:cl=stereo",
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-shortest", "-movflags", "+faststart", tmp_proof_clip,
            ]
        else:
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-vf", vf,
                "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
                "-an", "-movflags", "+faststart", tmp_proof_clip,
            ]

        result = subprocess.run(clip_cmd, capture_output=True, timeout=60)
        assert result.returncode == 0, f"proof clip 생성 실패:\n{result.stderr.decode()[:500]}"

        # concat
        with open(tmp_list, "w") as f:
            f.write(f"file '{tmp_video}'\n")
            f.write(f"file '{tmp_proof_clip}'\n")

        concat_cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", tmp_list,
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
        ]
        if has_audio:
            concat_cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"]
        else:
            concat_cmd += ["-an"]
        concat_cmd.append(tmp_output)

        result = subprocess.run(concat_cmd, capture_output=True, timeout=120)
        assert result.returncode == 0, f"concat 실패:\n{result.stderr.decode()[:500]}"

    finally:
        for tmp in [tmp_proof_clip, tmp_list]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)


def _run_audio_video_merge(
    tmp_video: str,
    tmp_audio: str,
    tmp_output: str,
    video_duration: float,
    audio_duration: float,
    audio_suffix: str = ".m4a",
) -> None:
    """
    merge.py / full_pipeline._audio_merge와 동일한 로직: video + audio → merged mp4.
    video >= audio: audio 루프, video copy.
    audio > video: video 루프, audio 그대로.
    """
    if video_duration >= audio_duration:
        cmd = [
            "ffmpeg", "-y",
            "-i", tmp_video,
            "-stream_loop", "-1", "-i", tmp_audio,
            "-t", str(video_duration),
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
            "-map", "0:v:0", "-map", "1:a:0",
            "-movflags", "+faststart",
            tmp_output,
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", tmp_video,
            "-i", tmp_audio,
            "-t", str(audio_duration),
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
            "-map", "0:v:0", "-map", "1:a:0",
            "-movflags", "+faststart",
            tmp_output,
        ]
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    assert result.returncode == 0, f"audio merge 실패:\n{result.stderr.decode()[:500]}"


# ── 테스트 케이스 ─────────────────────────────────────────────────────────────


class TestImageVideoMerge:
    """이미지 + 영상 concat (proof_merge) 테스트."""

    def test_merge_without_audio(self) -> None:
        """오디오 없는 영상 + 이미지 → concat 결과 검증."""
        tmp_video = _make_tmp(".mp4")
        tmp_image = _make_tmp(".jpg")
        tmp_output = _make_tmp(".mp4")

        try:
            _generate_test_video(tmp_video, duration=3)
            _generate_test_image(tmp_image)

            _run_image_video_merge(tmp_video, tmp_image, tmp_output)

            assert os.path.exists(tmp_output)
            assert os.path.getsize(tmp_output) > 0

            info = _probe_streams(tmp_output)
            assert info["has_video"], "출력에 비디오 스트림 없음"
            assert not info["has_audio"], "오디오 없는 영상인데 오디오 스트림 존재"
            # 원본 3초 + 이미지 3초 = 약 6초 (인코딩 오차 허용 ±1초)
            assert info["duration"] >= 5.0, f"예상 duration ≥ 6s, 실제: {info['duration']}"

        finally:
            for tmp in [tmp_video, tmp_image, tmp_output]:
                if os.path.exists(tmp):
                    os.unlink(tmp)

    def test_merge_with_audio(self) -> None:
        """오디오 포함 영상 + 이미지 → concat 결과 검증 (이미지 클립에 묵음 추가)."""
        tmp_video = _make_tmp(".mp4")
        tmp_image = _make_tmp(".png")
        tmp_output = _make_tmp(".mp4")

        try:
            _generate_test_video_with_audio(tmp_video, duration=3)
            _generate_test_image(tmp_image)

            _run_image_video_merge(tmp_video, tmp_image, tmp_output)

            assert os.path.exists(tmp_output)
            assert os.path.getsize(tmp_output) > 0

            info = _probe_streams(tmp_output)
            assert info["has_video"], "출력에 비디오 스트림 없음"
            assert info["has_audio"], "오디오 포함 영상인데 오디오 스트림 없음"
            assert info["duration"] >= 5.0, f"예상 duration ≥ 6s, 실제: {info['duration']}"

        finally:
            for tmp in [tmp_video, tmp_image, tmp_output]:
                if os.path.exists(tmp):
                    os.unlink(tmp)

    def test_output_dimensions_match_video(self) -> None:
        """이미지 클립의 해상도가 원본 영상과 동일한지 확인."""
        tmp_video = _make_tmp(".mp4")
        tmp_image = _make_tmp(".jpg")
        tmp_output = _make_tmp(".mp4")

        try:
            _generate_test_video(tmp_video, width=540, height=960, duration=2)
            _generate_test_image(tmp_image, width=300, height=400)  # 다른 해상도 이미지

            _run_image_video_merge(tmp_video, tmp_image, tmp_output)

            info = _probe_streams(tmp_output)
            assert info["width"] == 540, f"width 불일치: {info['width']}"
            assert info["height"] == 960, f"height 불일치: {info['height']}"

        finally:
            for tmp in [tmp_video, tmp_image, tmp_output]:
                if os.path.exists(tmp):
                    os.unlink(tmp)


class TestImageVideoAudioMerge:
    """이미지 + 영상 + 오디오 풀 파이프라인 테스트."""

    def test_full_pipeline(self) -> None:
        """오디오 merge → proof_merge(이미지 concat) 순서 전체 파이프라인 검증."""
        tmp_video = _make_tmp(".mp4")
        tmp_audio = _make_tmp(".m4a")
        tmp_image = _make_tmp(".jpg")
        tmp_audio_merged = _make_tmp(".mp4")
        tmp_final = _make_tmp(".mp4")

        try:
            _generate_test_video(tmp_video, duration=3)
            _generate_test_audio(tmp_audio, duration=5)
            _generate_test_image(tmp_image)

            # Step 1: video + audio merge (audio 5s > video 3s → video 루프)
            _run_audio_video_merge(tmp_video, tmp_audio, tmp_audio_merged, video_duration=3.0, audio_duration=5.0)

            assert os.path.exists(tmp_audio_merged)
            audio_info = _probe_streams(tmp_audio_merged)
            assert audio_info["has_video"], "audio merge 후 비디오 없음"
            assert audio_info["has_audio"], "audio merge 후 오디오 없음"

            # Step 2: audio-merged video + image concat
            _run_image_video_merge(tmp_audio_merged, tmp_image, tmp_final)

            assert os.path.exists(tmp_final)
            assert os.path.getsize(tmp_final) > 0

            final_info = _probe_streams(tmp_final)
            assert final_info["has_video"], "최종 출력 비디오 없음"
            assert final_info["has_audio"], "최종 출력 오디오 없음"
            # audio 5초 + image 3초 = 약 8초 (인코딩 오차 허용)
            assert final_info["duration"] >= 6.0, f"예상 ≥ 6s, 실제: {final_info['duration']}"

        finally:
            for tmp in [tmp_video, tmp_audio, tmp_image, tmp_audio_merged, tmp_final]:
                if os.path.exists(tmp):
                    os.unlink(tmp)

    def test_audio_only_merge(self) -> None:
        """audio merge 단독 검증: 오디오 duration만큼 영상이 loop되는지 확인."""
        tmp_video = _make_tmp(".mp4")
        tmp_audio = _make_tmp(".m4a")
        tmp_output = _make_tmp(".mp4")

        try:
            _generate_test_video(tmp_video, duration=2)  # 짧은 영상
            _generate_test_audio(tmp_audio, duration=7)

            _run_audio_video_merge(tmp_video, tmp_audio, tmp_output, video_duration=2.0, audio_duration=7.0)

            info = _probe_streams(tmp_output)
            assert info["has_video"]
            assert info["has_audio"]
            # -t 7 옵션으로 7초 clip
            assert info["duration"] >= 6.5, f"예상 ≥ 7s, 실제: {info['duration']}"

        finally:
            for tmp in [tmp_video, tmp_audio, tmp_output]:
                if os.path.exists(tmp):
                    os.unlink(tmp)

    def test_video_longer_than_audio(self) -> None:
        """핵심 버그 재현: 10초 영상 + 3초 오디오 → 출력이 10초여야 함 (과거에 3초로 버그)."""
        tmp_video = _make_tmp(".mp4")
        tmp_audio = _make_tmp(".m4a")
        tmp_output = _make_tmp(".mp4")

        try:
            _generate_test_video(tmp_video, duration=10)
            _generate_test_audio(tmp_audio, duration=3)

            _run_audio_video_merge(tmp_video, tmp_audio, tmp_output, video_duration=10.0, audio_duration=3.0)

            info = _probe_streams(tmp_output)
            assert info["has_video"], "출력에 비디오 스트림 없음"
            assert info["has_audio"], "출력에 오디오 스트림 없음"
            assert info["duration"] >= 9.5, f"예상 ≥ 10s, 실제: {info['duration']} (3초 버그 재발)"

        finally:
            for tmp in [tmp_video, tmp_audio, tmp_output]:
                if os.path.exists(tmp):
                    os.unlink(tmp)
