"""add proof_image_url to posts

Revision ID: c1d2e3f4a5b6
Revises: 1c41e8c2d709, a9b3c2d1e4f5
Create Date: 2026-05-27 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: tuple[str, ...] = ("1c41e8c2d709", "a9b3c2d1e4f5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("posts") as batch_op:
        batch_op.add_column(sa.Column("proof_image_url", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("posts") as batch_op:
        batch_op.drop_column("proof_image_url")
