"""add video subtitle metadata

Revision ID: 9b7c6d5e4f31
Revises: 86fa6f41d989
Create Date: 2026-06-05 08:10:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "9b7c6d5e4f31"
down_revision = "86fa6f41d989"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("videos") as batch_op:
        batch_op.add_column(sa.Column("subtitle_url", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("subtitle_text", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("subtitle_status", sa.String(length=20), nullable=False, server_default="skipped"))
        batch_op.add_column(sa.Column("subtitle_error", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("subtitle_metrics", sa.Text(), nullable=True))

    with op.batch_alter_table("videos") as batch_op:
        batch_op.alter_column("subtitle_status", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("videos") as batch_op:
        batch_op.drop_column("subtitle_metrics")
        batch_op.drop_column("subtitle_error")
        batch_op.drop_column("subtitle_status")
        batch_op.drop_column("subtitle_text")
        batch_op.drop_column("subtitle_url")
