import logging
import subprocess

logger = logging.getLogger(__name__)

_TELEGRAM_SCRIPT = "/home/measly/.claude/scripts/telegram-send.sh"


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
    _send(
        f"✅ <b>영상 업로드 성공</b>\n"
        f"• 유저: {username} ({email})\n"
        f"• 영상: {meta_line}\n"
        f"• 처리 시간: {elapsed}초\n"
        f"• 압축: {_fmt_mb(pre)} → {_fmt_mb(post)} ({ratio})\n"
        f"• job: <code>{job_id}</code>\n"
        f"• url: {cdn_url}"
    )


def notify_video_failure(job: dict, error: Exception, attempt: int, max_retries: int) -> None:
    job_id = job.get("job_id", "?")
    user_id = job.get("user_id", "?")
    final = attempt > max_retries
    status = "❌ <b>영상 업로드 최종 실패</b>" if final else f"⚠️ <b>영상 업로드 실패 (재시도 {attempt}/{max_retries})</b>"
    _send(
        f"{status}\n"
        f"• job: <code>{job_id}</code>\n"
        f"• user: {user_id}\n"
        f"• 오류: {type(error).__name__}: {error}"
    )
