import logging
import subprocess
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

_TELEGRAM_SCRIPT = "/home/measly/.claude/scripts/telegram-send.sh"
_KST = timedelta(hours=9)


def _now_kst() -> str:
    return (datetime.now(timezone.utc) + _KST).strftime("%Y-%m-%d %H:%M")


def _send(msg: str) -> None:
    try:
        subprocess.run(
            ["bash", _TELEGRAM_SCRIPT, msg],
            timeout=10,
            capture_output=True,
        )
    except Exception as e:
        logger.warning("텔레그램 전송 실패 (무시): %s", e)


def _fmt_mb(b: int) -> str:
    return f"{b / 1024 / 1024:.1f}MB" if b else "-"


def notify_video_success(job: dict, result: dict) -> None:
    job_id = job.get("job_id", "?")
    username = result.get("username") or str(job.get("user_id", "?"))
    email = result.get("email", "")
    cdn_url = result.get("cdn_url", "")
    elapsed = result.get("elapsed_sec", 0)
    pre = result.get("pre_size_bytes", 0)
    post = result.get("post_size_bytes", 0)
    ratio = f"{post / pre * 100:.0f}%" if pre and post else "-"
    meta = result.get("video_meta", {})
    duration = meta.get("duration_sec", 0)
    width = meta.get("width", 0)
    height = meta.get("height", 0)
    fps = meta.get("fps", 0)
    codec = meta.get("codec", "")
    meta_line = f"{duration}초  {width}x{height}  {fps}fps  {codec}" if width else "-"
    merge_type = result.get("merge_type", "video")
    has_proof = bool(job.get("proof_r2_key"))
    image_warn = "  ⚠️ 이미지 머지 실패" if has_proof and merge_type == "video" else ""
    _send(
        f"✅ <b>영상 업로드 성공</b>\n"
        f"• 유저: {username} ({email})\n"
        f"• 유형: {merge_type}{image_warn}\n"
        f"• 영상: {meta_line}\n"
        f"• 처리 시간: {elapsed}초\n"
        f"• 압축: {_fmt_mb(pre)} → {_fmt_mb(post)} ({ratio})\n"
        f"• job: <code>{job_id}</code>\n"
        f"• url: {cdn_url}\n"
        f"🕐 <b>시각</b>: {_now_kst()}"
    )


def notify_video_failure(
    job: dict,
    error: Exception,
    attempt: int,
    max_retries: int,
    pipeline_step: str | None = None,
) -> None:
    job_id = job.get("job_id", "?")
    user_id = job.get("user_id", "?")
    r2_key = job.get("r2_key", "?")
    duration = job.get("duration_sec", "?")
    has_audio = "있음" if job.get("audio_r2_key") else "없음"
    has_proof = "있음" if job.get("proof_r2_key") else "없음"
    final = attempt > max_retries

    if final:
        icon = "❌"
        title = "영상 업로드 최종 실패"
    else:
        icon = "⚠️"
        title = f"영상 업로드 실패 (재시도 {attempt}/{max_retries})"

    error_msg = str(error)
    if len(error_msg) > 400:
        error_msg = error_msg[:400] + "…"

    step_line = f"• 실패 단계: <b>{pipeline_step}</b>\n" if pipeline_step else ""

    _send(
        f"{icon} <b>{title}</b>\n"
        f"• 유저: {user_id}\n"
        f"• 길이: {duration}초  오디오: {has_audio}  증거사진: {has_proof}\n"
        f"• job: <code>{job_id}</code>\n"
        f"• 파일: <code>{r2_key}</code>\n"
        f"{step_line}"
        f"• 오류: <code>{type(error).__name__}: {error_msg}</code>\n"
        f"🔗 <b>컨텍스트</b>: Stack Health 업로드 파이프라인\n"
        f"🕐 <b>시각</b>: {_now_kst()}"
    )
