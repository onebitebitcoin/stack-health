"""merge notification and original video key heads

Revision ID: e1fac146a769
Revises: 373761a37e3f, f7a8b9c0d1e2
Create Date: 2026-06-20 16:47:28.221300

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1fac146a769'
down_revision: Union[str, None] = ('373761a37e3f', 'f7a8b9c0d1e2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
