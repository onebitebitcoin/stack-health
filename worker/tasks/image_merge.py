import logging
import os
import subprocess
import tempfile
import uuid

import boto3
from botocore.config import Config

from config import R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_URL, R2_SECRET_ACCESS_KEY

logger = logging.getLogger(__name__)


def _get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _make_tmp(suffix: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        return f.name


def run_image_merge(job: dict) -> dict:
    """R2에서 video와 proof 이미지를 다운로드하고 두 단계로 concat.
    Step 1: 이미지를 3초 클립으로 인코딩 (빠름, 영상 길이 무관)
    Step 2: concat demuxer + stream copy로 합치기 (원본 영상 재인코딩 없음)
    """
    video_r2_key: str = job["video_r2_key"]
    proof_r2_key: str = job["proof_r2_key"]
    img_suffix = ".jpg" if proof_r2_key.lower().endswith((".jpg", ".jpeg")) else ".png"

    tmp_video = _make_tmp(".mp4")
    tmp_image = _make_tmp(img_suffix)
    tmp_image_clip = _make_tmp(".mp4")
    tmp_output = _make_tmp(".mp4")

    try:
        client = _get_r2_client()

        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=proof_r2_key)
        with open(tmp_image, "wb") as f:
            f.write(resp["Body"].read())

        # 해상도 + fps 조회 (avg_frame_rate 사용 — r_frame_rate는 타임베이스라 90000/1 같은 값 반환)
        probe_v = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=width,height,avg_frame_rate",
             "-of", "csv=p=0", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        first_line = probe_v.stdout.strip().splitlines()[0] if probe_v.stdout.strip() else ""
        dims = first_line.split(",")
        vw = int(dims[0].strip()) if len(dims) >= 2 else 720
        vh = int(dims[1].strip()) if len(dims) >= 2 else 1280
        try:
            fps_raw = dims[2].strip() if len(dims) >= 3 else "30/1"
            num, den = (int(x) for x in fps_raw.split("/"))
            fps_val = num / den if den else 30
            if fps_val < 1:
                fps_val = 30
            fps = f"{min(int(fps_val), 60)}/1"
        except Exception:
            fps = "30/1"

        # rotate 태그로 display 해상도 보정
        probe_rot = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream_tags=rotate",
             "-of", "default=noprint_wrappers=1:nokey=1", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        try:
            rotation = abs(int(probe_rot.stdout.strip()))
        except ValueError:
            rotation = 0
        if rotation in (90, 270):
            vw, vh = vh, vw

        vw -= vw % 2
        vh -= vh % 2

        probe_a = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool(probe_a.stdout.strip())

        img_vf = (
            f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
            f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p"
        )

        # Step 1: 이미지 → 3초 클립 인코딩 (영상 길이와 무관하게 빠름)
        if has_audio:
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                "-vf", img_vf,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
                "-r", fps,
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-t", "3",
                tmp_image_clip,
            ]
        else:
            clip_cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-t", "3", "-i", tmp_image,
                "-vf", img_vf,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
                "-r", fps,
                "-an", "-t", "3",
                tmp_image_clip,
            ]

        result = subprocess.run(clip_cmd, capture_output=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError(f"이미지 클립 생성 실패: {result.stderr.decode()[-800:]}")

        # Step 2: filter_complex concat + h.264 인코딩 (코덱 불일치로 인한 검은 화면 방지)
        if has_audio:
            fc = "[0:v]fps={fps}[v0];[1:v]fps={fps}[v1];[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[outv][outa]".format(fps=fps)
            concat_cmd = [
                "ffmpeg", "-y",
                "-i", tmp_video,
                "-i", tmp_image_clip,
                "-filter_complex", fc,
                "-map", "[outv]", "-map", "[outa]",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                "-movflags", "+faststart",
                tmp_output,
            ]
        else:
            fc = "[0:v]fps={fps}[v0];[1:v]fps={fps}[v1];[v0][v1]concat=n=2:v=1:a=0[outv]".format(fps=fps)
            concat_cmd = [
                "ffmpeg", "-y",
                "-i", tmp_video,
                "-i", tmp_image_clip,
                "-filter_complex", fc,
                "-map", "[outv]",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
                "-an",
                "-movflags", "+faststart",
                tmp_output,
            ]

        result = subprocess.run(concat_cmd, capture_output=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"concat 실패: {result.stderr.decode()[-800:]}")

        merged_key = f"videos/proof-merged-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            client.put_object(Bucket=R2_BUCKET_NAME, Key=merged_key, Body=f, ContentType="video/mp4")

        return {
            "output_r2_key": merged_key,
            "cdn_url": f"{R2_PUBLIC_URL}/{merged_key}",
            "proof_image_url": f"{R2_PUBLIC_URL}/{proof_r2_key}",
        }

    finally:
        for tmp in [tmp_video, tmp_image, tmp_image_clip, tmp_output]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
