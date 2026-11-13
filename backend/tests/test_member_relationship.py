"""Regression tests for a descriptive kinship field on budget members."""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class MemberCollection:
    def __init__(self):
        self.rows = []

    async def count_documents(self, _filters):
        return len(self.rows)

    async def insert_one(self, row):
        self.rows.append(dict(row))

    async def update_one(self, filters, update):
        row = next((item for item in self.rows if all(item.get(k) == v for k, v in filters.items())), None)
        if row is None:
            return SimpleNamespace(matched_count=0)
        row.update(update["$set"])
        return SimpleNamespace(matched_count=1)

    async def find_one(self, filters, projection=None):
        row = next((item for item in self.rows if all(item.get(k) == v for k, v in filters.items())), None)
        if row is None:
            return None
        result = dict(row)
        for key, included in (projection or {}).items():
            if included == 0:
                result.pop(key, None)
        result.pop("_id", None)
        return result


def test_create_budget_person_saves_optional_relationship_without_auth_account(monkeypatch):
    members = MemberCollection()
    monkeypatch.setattr(server, "db", SimpleNamespace(members=members))

    created = asyncio.run(server.add_member(
        server.MemberIn(name="Maria", relationship="Avó"), family_id="family-1"
    ))

    assert created["name"] == "Maria"
    assert created["relationship"] == "Avó"
    assert "linked_user_id" not in created
    assert members.rows[0]["family_id"] == "family-1"


def test_relationship_can_remain_empty_for_existing_workflow(monkeypatch):
    members = MemberCollection()
    monkeypatch.setattr(server, "db", SimpleNamespace(members=members))

    created = asyncio.run(server.add_member(server.MemberIn(name="Ana"), family_id="family-1"))

    assert created["relationship"] is None


def test_edit_saves_and_returns_relationship(monkeypatch):
    members = MemberCollection()
    members.rows.append({"member_id": "member-1", "family_id": "family-1", "name": "Vó Ana", "photo_path": None})
    monkeypatch.setattr(server, "db", SimpleNamespace(members=members))

    updated = asyncio.run(server.update_member(
        "member-1", server.MemberIn(name="Ana Silva", relationship="Mãe"), family_id="family-1"
    ))

    assert updated["name"] == "Ana Silva"
    assert updated["relationship"] == "Mãe"
    assert members.rows[0]["relationship"] == "Mãe"


def test_custom_relationship_is_trimmed_and_length_limited():
    assert server.MemberIn(name="Ana", relationship="  madrinha  ").relationship == "madrinha"
    assert server.MemberIn(name="Ana", relationship="  ").relationship is None
    with pytest.raises(ValidationError):
        server.MemberIn(name="Ana", relationship="x" * 81)


def test_relationship_migration_is_additive_and_does_not_change_roles():
    migration = (Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611140002_family_member_relationship.sql").read_text()
    normalized = migration.lower()
    assert "add column if not exists relationship text" in normalized
    assert "drop table" not in normalized
    assert "delete from" not in normalized
    assert "update public.members" not in normalized
    assert "family_memberships" not in normalized
