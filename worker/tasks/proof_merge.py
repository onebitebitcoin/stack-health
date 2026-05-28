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


def run_proof_merge(job: dict) -> dict:
    """R2에서 video와 proof 이미지를 다운로드하고 proof를 3초 클립으로 concat."""
    video_r2_key: str = job["video_r2_key"]
    proof_r2_key: str = job["proof_r2_key"]
    img_suffix = ".jpg" if proof_r2_key.lower().endswith((".jpg", ".jpeg")) else ".png"

    tmp_video = _make_tmp(".mp4")
    tmp_image = _make_tmp(img_suffix)
    tmp_proof_clip = _make_tmp(".mp4")
    tmp_output = _make_tmp(".mp4")
    tmp_list = _make_tmp(".txt")

    try:
        client = _get_r2_client()

        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=video_r2_key)
        with open(tmp_video, "wb") as f:
            f.write(resp["Body"].read())

        resp = client.get_object(Bucket=R2_BUCKET_NAME, Key=proof_r2_key)
        with open(tmp_image, "wb") as f:
            f.write(resp["Body"].read())

        probe_v = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        first_line = probe_v.stdout.strip().splitlines()[0] if probe_v.stdout.strip() else ""
        dims = first_line.split(",")
        vw = dims[0].strip() if len(dims) >= 2 else "720"
        vh = dims[1].strip() if len(dims) >= 2 else "1280"

        probe_a = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "csv=p=0", tmp_video],
            capture_output=True, text=True, timeout=30,
        )
        has_audio = bool(probe_a.stdout.strip())

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

        vf = (
            f"scale={vw}:{vh}:force_original_aspect_ratio=decrease,"
            f"pad={vw}:{vh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
        )

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
        if result.returncode != 0:
            raise RuntimeError(f"proof clip 생성 실패: {result.stderr.decode()[:500]}")

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
        if result.returncode != 0:
            raise RuntimeError(f"concat 실패: {result.stderr.decode()[:500]}")

        merged_key = f"videos/proof-merged-{uuid.uuid4()}.mp4"
        with open(tmp_output, "rb") as f:
            client.put_object(Bucket=R2_BUCKET_NAME, Key=merged_key, Body=f, ContentType="video/mp4")

        return {
            "output_r2_key": merged_key,
            "cdn_url": f"{R2_PUBLIC_URL}/{merged_key}",
            "proof_image_url": f"{R2_PUBLIC_URL}/{proof_r2_key}",
        }

    finally:
        for tmp in [tmp_video, tmp_image, tmp_proof_clip, tmp_output, tmp_list]:
            if tmp and os.path.exists(tmp):
                os.unlink(tmp)
