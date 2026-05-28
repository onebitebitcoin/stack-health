import json
import logging
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models.claim import LightningClaim
from app.models.mining import MiningRound
from app.models.reward import RewardPoint
from app.models.user import User
from app.services import blink as blink_service
from app.services.reward import REWARD_STATUS_FIXED, REWARD_STATUS_REVOKED

logger = logging.getLogger(__name__)


def get_hash_power_distribution(db: Session, week_label: str) -> list[dict]:
    """Return all pending claimers with hash power percentages for the week."""
    claims = (
        db.query(LightningClaim)
        .filter(
            LightningClaim.week_label == week_label,
            LightningClaim.status == "pending",
        )
        .all()
    )
    if not claims:
        return []

    user_ids = [c.user_id for c in claims]
    users_map = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    }

    total_points = sum(float(c.points_used) for c in claims)
    result = []
    for c in claims:
        user = users_map.get(c.user_id)
        hash_pct = (float(c.points_used) / total_points * 100) if total_points > 0 else 0
        result.append({
            "claim_id": c.id,
            "user_id": c.user_id,
            "username": user.username if user else "",
            "ln_address": c.ln_address,
            "points": float(c.points_used),
            "sats_bid": c.satoshi_amount,
            "hash_power_pct": round(hash_pct, 2),
        })

    return sorted(result, key=lambda x: x["points"], reverse=True)


def run_lottery(
    db: Session,
    week_label: str,
    n: int = 1008,
    do_pay: bool = True,
) -> dict:
    """Run probabilistic lottery for the week.

    N = number of draws (fixed).
    reward_per_draw = floor(pool / N) → sats awarded per winning draw.
    dividend = pool % N → distributed proportionally to all participants.
    Each draw: winner selected by hash-power weighted random.
    """
    claims = (
        db.query(LightningClaim)
        .filter(
            LightningClaim.week_label == week_label,
            LightningClaim.status == "pending",
        )
        .all()
    )

    if not claims:
        return {"error": "참여자가 없습니다"}

    total_pool = sum(c.satoshi_amount for c in claims)
    reward_per_draw = total_pool // n

    if reward_per_draw == 0:
        return {"error": f"풀이 너무 작습니다 ({total_pool} sats, N={n}). N을 줄여주세요."}

    user_ids = [c.user_id for c in claims]
    weights = [float(c.points_used) for c in claims]
    claim_by_uid = {c.user_id: c for c in claims}

    draw_winners = random.choices(user_ids, weights=weights, k=n)

    winnings: dict[int, int] = {}
    for winner_id in draw_winners:
        winnings[winner_id] = winnings.get(winner_id, 0) + reward_per_draw

    # dividend distributed proportionally to all participants; dust to top hash-power
    dividend = total_pool - sum(winnings.values())
    if dividend > 0:
        total_weights = sum(weights)
        top_uid = user_ids[weights.index(max(weights))]
        distributed = 0
        for uid, w in zip(user_ids, weights):
            share = int(dividend * w / total_weights)
            if share > 0:
                winnings[uid] = winnings.get(uid, 0) + share
                distributed += share
        dust = dividend - distributed
        if dust > 0:
            winnings[top_uid] = winnings.get(top_uid, 0) + dust

    mining_round = db.query(MiningRound).filter(MiningRound.week_label == week_label).first()
    if mining_round is None:
        mining_round = MiningRound(week_label=week_label)
        db.add(mining_round)

    mining_round.total_pool_sats = total_pool
    mining_round.sats_per_block = reward_per_draw
    mining_round.total_blocks = n
    mining_round.participant_count = len(claims)
    mining_round.winner_count = len(winnings)
    mining_round.result_json = json.dumps({str(k): v for k, v in winnings.items()})
    mining_round.status = "distributed"
    mining_round.distributed_at = datetime.now(timezone.utc)
    db.flush()

    paid_results = []
    for user_id, sats_won in winnings.items():
        claim = claim_by_uid.get(user_id)
        if not claim:
            continue

        claim.satoshi_amount = sats_won
        claim.payment_memo = f"Distribution {week_label}: {sats_won} sats"

        if do_pay and settings.blink_api_key:
            result = blink_service.pay_lightning_address(claim.ln_address, sats_won)
            if result["success"]:
                claim.status = "paid"
                paid_results.append({"user_id": user_id, "sats_won": sats_won, "status": "paid"})
            else:
                claim.status = "failed"
                logger.error("Mining payment failed uid=%s: %s", user_id, result.get("error"))
                paid_results.append({"user_id": user_id, "sats_won": sats_won, "status": "failed", "error": result.get("error")})
        else:
            paid_results.append({"user_id": user_id, "sats_won": sats_won, "status": "pending_payment"})

    for uid in set(user_ids) - set(winnings.keys()):
        claim = claim_by_uid.get(uid)
        if claim:
            claim.status = "cancelled"

    db.flush()

    return {
        "week_label": week_label,
        "total_pool_sats": total_pool,
        "n": n,
        "reward_per_draw": reward_per_draw,
        "participant_count": len(claims),
        "winner_count": len(winnings),
        "results": paid_results,
    }


def close_week(db: Session, week_label: str) -> dict:
    """Close the week: reduce non-claimers' weekly points to 1/7."""
    claimed_user_ids = {
        row.user_id
        for row in db.query(LightningClaim.user_id)
        .filter(LightningClaim.week_label == week_label)
        .all()
    }

    reward_points = (
        db.query(RewardPoint)
        .filter(
            RewardPoint.week_label == week_label,
            RewardPoint.status == REWARD_STATUS_FIXED,
        )
        .all()
    )

    user_points: dict[int, list] = {}
    for rp in reward_points:
        if rp.user_id not in claimed_user_ids:
            user_points.setdefault(rp.user_id, []).append(rp)

    reduced_count = 0
    for user_id, points_list in user_points.items():
        total = sum(p.points for p in points_list)
        for p in points_list:
            p.status = REWARD_STATUS_REVOKED
        reduced_rp = RewardPoint(
            user_id=user_id,
            week_label=week_label,
            points=round(total / 7, 4),
            reason="weekly_penalty",
            status=REWARD_STATUS_FIXED,
        )
        db.add(reduced_rp)
        reduced_count += 1

    mining_round = db.query(MiningRound).filter(MiningRound.week_label == week_label).first()
    if mining_round is None:
        mining_round = MiningRound(week_label=week_label)
        db.add(mining_round)
    mining_round.status = "closed"
    mining_round.closed_at = datetime.now(timezone.utc)

    db.flush()

    return {
        "week_label": week_label,
        "reduced_user_count": reduced_count,
        "claimed_user_count": len(claimed_user_ids),
    }
