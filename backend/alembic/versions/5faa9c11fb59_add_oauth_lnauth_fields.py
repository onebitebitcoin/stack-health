"""add_oauth_lnauth_fields

Revision ID: 5faa9c11fb59
Revises: aae8cc5d46dc
Create Date: 2026-05-25 09:42:01.445813

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5faa9c11fb59'
down_revision: Union[str, None] = 'aae8cc5d46dc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lnauth_challenges',
        sa.Column('k1', sa.String(length=64), nullable=False),
        sa.Column('pubkey', sa.String(), nullable=True),
        sa.Column('verified', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('k1'),
    )

    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('oauth_provider', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('oauth_sub', sa.String(), nullable=True))
        batch_op.alter_column('email', existing_type=sa.VARCHAR(), nullable=True)
        batch_op.alter_column('password_hash', existing_type=sa.VARCHAR(), nullable=True)
        batch_op.alter_column(
            'app_settings',
            existing_type=sa.TEXT(),
            type_=sa.JSON(),
            existing_nullable=False,
            existing_server_default=sa.text("'{}'"),
        )


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column(
            'app_settings',
            existing_type=sa.JSON(),
            type_=sa.TEXT(),
            existing_nullable=False,
            existing_server_default=sa.text("'{}'"),
        )
        batch_op.alter_column('password_hash', existing_type=sa.VARCHAR(), nullable=False)
        batch_op.alter_column('email', existing_type=sa.VARCHAR(), nullable=False)
        batch_op.drop_column('oauth_sub')
        batch_op.drop_column('oauth_provider')

    op.drop_table('lnauth_challenges')
