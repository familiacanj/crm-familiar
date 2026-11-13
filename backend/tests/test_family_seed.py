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


class CreateCollection(CaptureCollection):
    def __init__(self):
        self.rows = []
        self.updated = []

    async def find_one(self, *_args, **_kwargs):
        return None

    async def insert_one(self, row):
        self.rows.append(dict(row))

    async def update_one(self, filters, update, **_kwargs):
        self.updated.append((filters, update))


class FamilyCreationDB:
    def __init__(self):
        self.families = CreateCollection()
        self.members = CreateCollection()
        self.categories = CreateCollection()
        self.users = CreateCollection()
        self.family_memberships = CreateCollection()
        self.family_user_profiles = CreateCollection()


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


def test_create_family_endpoint_never_creates_fabricated_relatives(monkeypatch):
    db = FamilyCreationDB()
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "make_code", lambda: "ABC123")

    async def family_info(family_id, viewer_user_id):
        return {"family_id": family_id, "viewer_user_id": viewer_user_id}

    monkeypatch.setattr(server, "family_info", family_info)
    user = {"user_id": "auth-owner", "name": "Ana Silva", "family_id": None, "memberships": []}

    result = asyncio.run(server.create_family(server.FamilyCreate(name="Família Silva"), user))

    assert result["family_id"].startswith("fam_")
    assert result["viewer_user_id"] == "auth-owner"
    assert [member["name"] for member in db.members.rows] == ["Ana Silva"]
    assert {member["name"] for member in db.members.rows}.isdisjoint({"Eu", "Esposa", "Filha", "Mãe"})
    assert db.members.rows[0]["linked_user_id"] == "auth-owner"
    assert db.family_memberships.rows[0]["role"] == "owner"
    assert db.family_user_profiles.rows[0]["display_name"] == "Ana Silva"
