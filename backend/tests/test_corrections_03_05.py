"""Focused regressions for commitments, privacy, month overrides and responsive source."""
import asyncio
import os
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import HTTPException

import server
from supabase_db import SupabaseDB


class Query:
    def __init__(self, rows): self.rows = rows
    def sort(self, *_args): return self
    async def to_list(self, *_args): return [dict(row) for row in self.rows]


class Collection:
    def __init__(self, rows=()): self.rows = [dict(row) for row in rows]; self.writes = []
    def find(self, filters=None, *_args):
        filters = filters or {}
        rows = [row for row in self.rows if all(row.get(key) == value for key, value in filters.items())]
        return Query(rows)
    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        return next((dict(row) for row in self.rows if all(row.get(k) == v for k, v in filters.items())), None)
    async def update_one(self, filters, update, upsert=False):
        self.writes.append((filters, update, upsert))
        return SimpleNamespace(matched_count=1)


def test_commitments_count_transfers_and_direct_expenses_without_cash_duplication():
    members = [{"member_id": "m-a", "name": "Adult A", "linked_user_id": "adult-a"}]
    schedules = [
        {"member_id": "m-a", "effective_year": 2026, "effective_month": 11, "amount": 1000},
    ]
    movements = [
        {"created_by_user_id": "adult-a", "occurred_on": "2026-11-05", "kind": "personal_to_family_transfer", "amount": 600},
        {"created_by_user_id": "adult-a", "occurred_on": "2026-11-07", "kind": "direct_family_expense", "amount": 600},
    ]
    status = server.contribution_commitment_status(members, schedules, movements, 2026, 11)[0]
    assert status == {
        "member_id": "m-a", "user_id": "adult-a", "name": "Adult A", "commitment": 1000,
        "cash": 600, "family_expenses": 600, "total": 1200,
        "credit_balance": 200, "pending_balance": 0, "association_status": "linked",
    }
    cash = server.summarize_family_financial_movements(movements, [], [])
    assert cash["cash_in"] == 600
    assert cash["cash_delta"] == 600
    assert cash["contributions"] == 1200


def test_commitment_credit_carries_and_future_shortfall_remains_pending():
    members = [{"member_id": "m-a", "name": "Adult A", "linked_user_id": "adult-a"}]
    schedules = [{"member_id": "m-a", "effective_year": 2026, "effective_month": 11, "amount": 1000}]
    movements = [
        {"created_by_user_id": "adult-a", "occurred_on": "2026-11-05", "kind": "personal_to_family_transfer", "amount": 600},
        {"created_by_user_id": "adult-a", "occurred_on": "2026-11-07", "kind": "direct_family_expense", "amount": 600},
        {"created_by_user_id": "adult-a", "occurred_on": "2026-12-05", "kind": "personal_to_family_transfer", "amount": 500},
    ]
    status = server.contribution_commitment_status(members, schedules, movements, 2026, 12)[0]
    assert status["commitment"] == 1000
    assert status["credit_balance"] == 0
    assert status["pending_balance"] == 300


@pytest.mark.parametrize("category_id", ["electricity", "food", "family-income"])
def test_month_only_entry_upsert_uses_existing_primary_key_columns_and_valid_fields(monkeypatch, category_id):
    entries = Collection()
    monkeypatch.setattr(server, "db", SimpleNamespace(entries=entries))
    async def manager(_user): return ("fam-1", "owner-1", {"role": "owner"})
    monkeypatch.setattr(server, "require_family_manager_scope", manager)
    result = asyncio.run(server.set_entry(
        server.EntryIn(year=2026, month=11, ref_type="category", ref_id=category_id, value=180),
        {"user_id": "owner-1"},
    ))
    assert result == {"ok": True}
    key, update, upsert = entries.writes[0]
    assert key == {"family_id": "fam-1", "year": 2026, "month": 11, "ref_id": category_id}
    assert update == {"$set": {"value": 180.0, "ref_type": "category"}}
    assert "updated_at" not in update["$set"]
    assert upsert is True
    assert SupabaseDB("https://unit-test.supabase.co", "unit-test-only").conflict_columns["entries"] == "family_id,year,month,ref_id"


def test_member_entry_changes_commitment_not_legacy_salary_and_never_changes_past(monkeypatch):
    commitments = Collection()
    members = Collection([{"member_id": "m-a", "family_id": "fam-1", "default_income": 9000}])
    monkeypatch.setattr(server, "db", SimpleNamespace(family_monthly_commitments=commitments, members=members))
    monkeypatch.setattr(server, "local_today", lambda: date(2026, 11, 18))
    async def manager(_user): return ("fam-1", "owner-1", {"role": "owner"})
    monkeypatch.setattr(server, "require_family_manager_scope", manager)
    result = asyncio.run(server.set_entry(
        server.EntryIn(year=2026, month=11, ref_type="member", ref_id="m-a", value=1000),
        {"user_id": "owner-1"},
    ))
    assert result == {"ok": True}
    assert commitments.writes[0][0]["member_id"] == "m-a"
    assert commitments.writes[0][1]["$set"]["amount"] == 1000
    assert "default_income" not in commitments.writes[0][1]["$set"]

    with pytest.raises(HTTPException) as error:
        asyncio.run(server.upsert_family_commitment("fam-1", "m-a", 2026, 10, 1000, "owner-1"))
    assert error.value.status_code == 409
    assert len(commitments.writes) == 1


def test_member_may_set_only_own_commitment_and_managers_can_set_family_member(monkeypatch):
    commitments = Collection()
    members = Collection([
        {"member_id": "m-a", "family_id": "fam-1", "linked_user_id": "adult-a"},
        {"member_id": "m-b", "family_id": "fam-1", "linked_user_id": "adult-b"},
    ])
    monkeypatch.setattr(server, "db", SimpleNamespace(family_monthly_commitments=commitments, members=members))
    monkeypatch.setattr(server, "local_today", lambda: date(2026, 11, 18))
    async def member_scope(_user): return ("fam-1", "adult-a", {"role": "member"})
    monkeypatch.setattr(server, "require_family_membership_scope", member_scope)

    own = asyncio.run(server.set_family_commitment("m-a", 2026, 11, server.FamilyCommitmentIn(amount=250), {"user_id": "adult-a"}))
    assert own["amount"] == 250
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.set_family_commitment("m-b", 2026, 11, server.FamilyCommitmentIn(amount=250), {"user_id": "adult-a"}))
    assert error.value.status_code == 403
    assert len(commitments.writes) == 1

    async def admin_scope(_user): return ("fam-1", "admin-a", {"role": "admin"})
    monkeypatch.setattr(server, "require_family_membership_scope", admin_scope)
    changed = asyncio.run(server.set_family_commitment("m-b", 2026, 11, server.FamilyCommitmentIn(amount=800), {"user_id": "admin-a"}))
    assert changed["amount"] == 800
    assert len(commitments.writes) == 2


def test_family_month_payload_never_serializes_legacy_salary():
    result = server.compute_month(11, [{"member_id": "m-a", "name": "Adult A", "default_income": 9000}], [], {})
    assert result["sections"]["income"] == []
    assert "9000" not in repr(result)
