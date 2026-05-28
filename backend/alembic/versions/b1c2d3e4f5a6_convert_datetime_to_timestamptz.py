"""convert datetime columns to timestamptz

Revision ID: b1c2d3e4f5a6
Revises: a3b4c5d6e7f8
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


revision = "b1c2d3e4f5a6"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None

# (table, column) pairs to migrate — app_links already uses timezone=True
_COLUMNS: list[tuple[str, str]] = [
    ("posts", "created_at"),
    ("users", "created_at"),
    ("comments", "created_at"),
    ("videos", "created_at"),
    ("mining_rounds", "created_at"),
    ("mining_rounds", "distributed_at"),
    ("mining_rounds", "closed_at"),
    ("post_likes", "created_at"),
    ("post_views", "created_at"),
    ("lightning_claims", "created_at"),
    ("lightning_claims", "updated_at"),
    ("admin_logs", "created_at"),
    ("reward_points", "created_at"),
    ("challenges", "start_date"),
    ("challenges", "end_date"),
    ("challenges", "created_at"),
    ("challenge_participations", "completed_at"),
    ("challenge_participations", "joined_at"),
    ("lnauth_challenges", "created_at"),
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table, column in _COLUMNS:
        # Check column is nullable to handle nullable columns gracefully
        insp = Inspector.from_engine(bind)
        cols = {c["name"]: c for c in insp.get_columns(table)}
        if column not in cols:
            continue
        nullable = cols[column]["nullable"]
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=nullable,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table, column in _COLUMNS:
        insp = Inspector.from_engine(bind)
        cols = {c["name"]: c for c in insp.get_columns(table)}
        if column not in cols:
            continue
        nullable = cols[column]["nullable"]
        op.alter_column(
            table,
            column,
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=nullable,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
