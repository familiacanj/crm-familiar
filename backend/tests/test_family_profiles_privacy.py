"""Regression checks for family-scoped profiles and private finance boundaries."""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import HTTPException

import server


class Query:
    def __init__(self, rows): self.rows = rows
    def sort(self, *_args): return self
    async def to_list(self, *_args): return [dict(row) for row in self.rows]


class Collection:
    def __init__(self, rows=()): self.rows = [dict(row) for row in rows]; self.last_filter = None
    def find(self, filters=None, *_args):
        self.last_filter = filters or {}
        def match(row, filt):
            return all(row.get(key) == value for key, value in filt.items() if not key.startswith("$"))
        return Query([row for row in self.rows if match(row, self.last_filter)])
    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        def matches(row):
            for key, value in filters.items():
                if isinstance(value, dict) and "$in" in value:
                    if row.get(key) not in value["$in"]: return False
                elif row.get(key) != value:
                    return False
            return True
        return next((dict(row) for row in self.rows if matches(row)), None)
    async def insert_one(self, row): self.rows.append(dict(row))
    async def update_one(self, *_args, **_kwargs): return SimpleNamespace(matched_count=1)


def test_member_cannot_edit_shared_month_entries(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "member", "role": "member"}]),
        entries=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.set_entry(server.EntryIn(ref_type="category", ref_id="cat-a", year=2026, month=11, value=20), "fam-a", {"user_id": "member"}))
    assert exc.value.status_code == 403
    assert db.entries.rows == []


def test_private_summary_queries_only_the_authenticated_users_items(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
        personal_financial_items=Collection([
            {"family_id": "fam-a", "owner_user_id": "user-a", "item_id": "private-a", "kind": "variable", "name": "Meu gasto", "default_value": 0},
            {"family_id": "fam-a", "owner_user_id": "user-b", "item_id": "private-b", "kind": "variable", "name": "Outro gasto", "default_value": 0},
        ]),
        personal_financial_entries=Collection([
            {"family_id": "fam-a", "owner_user_id": "user-a", "item_id": "private-a", "year": 2026, "month": 11, "value": 35},
            {"family_id": "fam-a", "owner_user_id": "user-b", "item_id": "private-b", "year": 2026, "month": 11, "value": 99},
        ]),
    )
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.personal_summary(2026, 11, {"family_id": "fam-a", "user_id": "user-a"}))
    assert result["items"] == [{"item_id": "private-a", "kind": "variable", "name": "Meu gasto", "value": 35}]
    assert result["expenses"] == 35
    assert db.personal_financial_items.last_filter["owner_user_id"] == "user-a"
    assert db.personal_financial_entries.last_filter["owner_user_id"] == "user-a"


def test_removed_member_cannot_mutate_personal_finances(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection(),
        personal_financial_items=Collection([{
            "family_id": "fam-a", "owner_user_id": "user-a", "item_id": "private-a",
            "kind": "variable", "name": "Meu gasto", "default_value": 0,
        }]),
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.delete_personal_item("private-a", {"family_id": "fam-a", "user_id": "user-a"}))
    assert exc.value.status_code == 403
    assert len(db.personal_financial_items.rows) == 1


def test_member_can_add_shared_expense_but_row_is_owned_and_append_only(monkeypatch):
    category = {"family_id": "fam-a", "category_id": "cat-a", "kind": "variable"}
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
        categories=Collection([category]),
        shared_expense_transactions=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.create_shared_expense(
        server.SharedExpenseIn(category_id="cat-a", year=2026, month=11, amount=42, description="Almoço"),
        {"family_id": "fam-a", "user_id": "user-a"},
    ))
    assert result["ok"] is True
    assert db.shared_expense_transactions.rows[0]["created_by"] == "user-a"
    assert db.shared_expense_transactions.rows[0]["family_id"] == "fam-a"
    assert not any(route.path == "/api/shared-expenses/{transaction_id}" and "DELETE" in route.methods for route in server.app.routes)
    assert not any(route.path == "/api/shared-expenses/{transaction_id}" and "PUT" in route.methods for route in server.app.routes)


def test_member_cannot_add_expense_to_another_familys_category(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
        categories=Collection([{"family_id": "fam-b", "category_id": "cat-b", "kind": "variable"}]),
        shared_expense_transactions=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.create_shared_expense(
            server.SharedExpenseIn(category_id="cat-b", year=2026, month=11, amount=42),
            {"family_id": "fam-a", "user_id": "user-a"},
        ))
    assert exc.value.status_code == 404
    assert db.shared_expense_transactions.rows == []


def test_auth_me_prefers_family_name_without_overwriting_google_profile(monkeypatch):
    global_profile = {"user_id": "user-a", "name": "Google Name", "family_id": "fam-a", "picture": "google.jpg"}
    db = SimpleNamespace(family_user_profiles=Collection([{
        "family_id": "fam-a", "user_id": "user-a", "display_name": "Nome da Família", "photo_path": None,
    }]))
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.auth_me(global_profile))
    assert result["name"] == "Nome da Família"
    assert global_profile["name"] == "Google Name"


def test_exports_are_built_from_shared_data_only():
    source = Path(server.__file__).read_text(encoding="utf-8")
    migration = (Path(__file__).resolve().parents[2] / "supabase/migrations/202611130001_family_profiles_private_finances.sql").read_text(encoding="utf-8")
    year_table = source.split("async def year_table", 1)[1].split("def money", 1)[0]
    assert "load(family_id, year)" in year_table
    assert "personal_financial_items" not in year_table
    assert "personal_financial_entries" not in year_table
    assert "alter table public.personal_financial_items enable row level security" in migration
    assert "alter table public.personal_financial_entries enable row level security" in migration
    assert "personal_items_owner_only" in migration and "personal_entries_owner_only" in migration
    assert "update public.profiles set family_id = invitation.family_id, family_role = 'member' where user_id = p_user_id;" in migration
    assert "name = coalesce(next_name" not in migration
