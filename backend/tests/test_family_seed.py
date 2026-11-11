"""Regression coverage for creating a family without fabricated relatives."""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class CaptureCollection:
    def __init__(self):
        self.rows = []

    async def insert_many(self, rows):
        self.rows = rows


def test_new_family_starts_with_only_the_authenticated_owner(monkeypatch):
    members = CaptureCollection()
    categories = CaptureCollection()
    monkeypatch.setattr(server, "db", SimpleNamespace(members=members, categories=categories))

    asyncio.run(server.seed_family("family-test", "  Ana Silva  ", "auth-owner"))

    assert [member["name"] for member in members.rows] == ["Ana Silva"]
    card_categories = [category for category in categories.rows if category["name"] == "Cartão de crédito"]
    assert len(card_categories) == 1
    assert card_categories[0]["member_id"] == members.rows[0]["member_id"]
    assert members.rows[0]["linked_user_id"] == "auth-owner"
    assert all(category["family_id"] == "family-test" for category in categories.rows)
