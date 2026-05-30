"""add_reward_point_indexes

Revision ID: c5ea3de62f3a
Revises: fd4630489dff
Create Date: 2026-05-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "c5ea3de62f3a"
down_revision: Union[str, None] = "bb5c4690cd98"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # RewardPoint: 포인트 집계/리더보드에 사용되는 복합 인덱스
    op.create_index(
        "ix_reward_points_user_week_status",
        "reward_points",
        ["user_id", "week_label", "status"],
    )
    op.create_index(
        "ix_reward_points_status_created",
        "reward_points",
        ["status", "created_at"],
    )
    # LightningClaim: week_label 선두 조회 지원
    op.create_index(
        "ix_lightning_claims_week_status",
        "lightning_claims",
        ["week_label", "status"],
    )
    # Comment: post_id 기준 count 쿼리
    op.create_index(
        "ix_comments_post_id",
        "comments",
        ["post_id"],
    )
    # ChallengeParticipation: user_id + challenge_id 필터
    op.create_index(
        "ix_challenge_participations_user_challenge",
        "challenge_participations",
        ["user_id", "challenge_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_challenge_participations_user_challenge", table_name="challenge_participations")
    op.drop_index("ix_comments_post_id", table_name="comments")
    op.drop_index("ix_lightning_claims_week_status", table_name="lightning_claims")
    op.drop_index("ix_reward_points_status_created", table_name="reward_points")
    op.drop_index("ix_reward_points_user_week_status", table_name="reward_points")
