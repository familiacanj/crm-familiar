"""Regression tests for logical family access revocation and personal transactions."""
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
from supabase_db import SupabaseDBError


class Collection:
    def __init__(self, rows=()):
        self.rows = [dict(row) for row in rows]

    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        row = next((row for row in self.rows if _matches(row, filters)), None)
        return dict(row) if row else None

    def find(self, filters=None, *_args):
        filters = filters or {}
        rows = [row for row in self.rows if _matches(row, filters)]
        return Query(rows)


class Query:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, *_args):
        return [dict(row) for row in self.rows]


def _matches(row, filters):
    return all(
        _matches_condition(row.get(key), condition)
        for key, condition in filters.items()
    )


def _matches_condition(actual, condition):
    if not isinstance(condition, dict):
        return actual == condition
    if "$in" in condition:
        return actual in condition["$in"]
    return all({"$gte": actual >= expected, "$lt": actual < expected}.get(operator, False)
               for operator, expected in condition.items())


async def _resolved(rows):
    return [dict(row) for row in rows]


def test_revoked_member_keeps_only_private_finance_scope(monkeypatch):
    memberships = [
        {"family_id": "family-a", "user_id": "former-member", "role": "member", "is_active": False},
        {"family_id": "family-b", "user_id": "former-member", "role": "member", "is_active": True},
    ]
    monkeypatch.setattr(server, "db", SimpleNamespace(family_memberships=Collection(memberships)))

    assert asyncio.run(server.require_personal_scope({"user_id": "former-member", "family_id": "family-a"})) == (
        "family-a", "former-member"
    )
    assert asyncio.run(server.personal_family_ids_for_owner("family-b", "former-member")) == ["family-a", "family-b"]
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.require_family_membership_scope({"user_id": "former-member", "family_id": "family-a"}))
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.get_family_id({"user_id": "former-member", "family_id": "family-a"}))
    assert exc.value.status_code == 403


def test_active_membership_listing_hides_revoked_rows_and_accepts_legacy_rows(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(family_memberships=Collection([
        {"family_id": "family-a", "user_id": "active", "role": "member", "is_active": True},
        {"family_id": "family-a", "user_id": "revoked", "role": "member", "is_active": False},
        {"family_id": "family-a", "user_id": "legacy", "role": "member"},
    ])))
    result = asyncio.run(server.list_active_family_memberships({"family_id": "family-a"}))
    assert {row["user_id"] for row in result} == {"active", "legacy"}


def test_remove_endpoint_uses_authenticated_actor_and_selected_family(monkeypatch):
    calls = []

    async def rpc(name, args):
        calls.append((name, args))

    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([{"family_id": "family-a", "user_id": "owner", "role": "owner", "is_active": True}]),
        rpc=rpc,
    ))
    result = asyncio.run(server.remove_family_user("member-b", {"user_id": "owner", "family_id": "family-a"}))
    assert result == {"ok": True}
    assert calls == [("revoke_family_member_access", {
        "p_family_id": "family-a", "p_actor_user_id": "owner", "p_target_user_id": "member-b",
    })]


def test_removed_member_cannot_call_family_mutation_route(monkeypatch):
    calls = []

    async def rpc(*args):
        calls.append(args)

    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([{"family_id": "family-a", "user_id": "member", "role": "member", "is_active": False}]),
        rpc=rpc,
    ))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.remove_family_user("someone", {"user_id": "member", "family_id": "family-a"}))
    assert exc.value.status_code == 403
    assert calls == []


@pytest.mark.parametrize("route,body", [
    (server.update_personal_income, server.PersonalIncomeUpdate(amount=2200, occurred_on="2026-11-05", description="Salário atualizado")),
    (server.update_personal_expense, server.PersonalExpenseUpdate(total_amount=180, occurred_on="2026-11-06", description="Compra atualizada")),
])
def test_personal_update_rpc_is_scoped_to_authenticated_owner(monkeypatch, route, body):
    calls = []

    async def rpc(name, args):
        calls.append((name, args))
        return [{"transaction_id": "own-transaction"}]

    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([
            {"family_id": "family-a", "user_id": "owner", "role": "member", "is_active": False},
            {"family_id": "family-b", "user_id": "owner", "role": "member", "is_active": True},
        ]),
        personal_income_transactions=Collection([{"transaction_id": "own-transaction", "family_id": "family-a", "owner_user_id": "owner"}]),
        personal_expense_transactions=Collection([{"transaction_id": "own-transaction", "family_id": "family-a", "owner_user_id": "owner"}]),
        rpc=rpc,
    ))
    result = asyncio.run(route("own-transaction", body, {"user_id": "owner", "family_id": "family-b"}))
    assert result["transaction_id"] == "own-transaction"
    assert calls[0][1]["p_owner_user_id"] == "owner"
    assert calls[0][1]["p_family_id"] == "family-a"


def test_transaction_lookup_never_finds_another_users_row(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(personal_income_transactions=Collection([
        {"transaction_id": "private-to-someone-else", "family_id": "family-a", "owner_user_id": "other"},
    ])))
    family_id = asyncio.run(server.find_owned_personal_transaction_family(
        "personal_income_transactions", "private-to-someone-else", ["family-a"], "owner",
    ))
    assert family_id is None


def test_personal_summary_keeps_owner_history_across_family_revocation(monkeypatch):
    user_id = "former-member"
    db = SimpleNamespace(
        family_memberships=Collection([
            {"family_id": "family-a", "user_id": user_id, "role": "member", "is_active": False},
            {"family_id": "family-b", "user_id": user_id, "role": "member", "is_active": True},
        ]),
        personal_financial_items=Collection([]),
        personal_financial_entries=Collection([]),
        personal_expense_transactions=Collection([
            {"family_id": "family-a", "owner_user_id": user_id, "transaction_id": "old", "occurred_on": date(2026, 11, 5), "total_amount": 75, "personal_amount": 25, "family_amount": 50, "description": "mercado", "deleted_at": None},
            {"family_id": "family-a", "owner_user_id": "another-user", "transaction_id": "private", "occurred_on": date(2026, 11, 5), "total_amount": 900, "personal_amount": 900, "family_amount": 0, "description": "private", "deleted_at": None},
        ]),
        personal_family_transfers=Collection([
            {"family_id": "family-a", "owner_user_id": user_id, "direction": "personal_to_family", "amount": 300, "occurred_on": date(2026, 11, 10)},
        ]),
        personal_income_transactions=Collection([
            {"family_id": "family-a", "owner_user_id": user_id, "transaction_id": "salary", "occurred_on": date(2026, 11, 1), "amount": 2000, "description": "salary", "deleted_at": None},
            {"family_id": "family-b", "owner_user_id": user_id, "transaction_id": "new-income", "occurred_on": date(2026, 11, 2), "amount": 500, "description": "extra", "deleted_at": None},
        ]),
        family_financial_movements=Collection([]),
        family_reimbursements=Collection([]),
    )
    monkeypatch.setattr(server, "db", db)

    summary = asyncio.run(server.personal_summary_data("family-b", user_id, 2026, 11))
    assert summary["income"] == 2500
    assert summary["expenses"] == 75
    assert summary["family_paid_expenses"] == 50
    assert summary["cash_transfers_out"] == 300
    assert summary["balance"] == 2125
    assert {row["transaction_id"] for row in summary["transactions"]} == {"old", "salary", "new-income"}


def test_linked_family_expense_cannot_be_changed_through_personal_api(monkeypatch):
    async def rpc(_name, _args):
        raise SupabaseDBError("personal_expense_family_linked")

    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([{"family_id": "family-a", "user_id": "owner", "role": "member", "is_active": True}]),
        personal_expense_transactions=Collection([{"transaction_id": "linked-expense", "family_id": "family-a", "owner_user_id": "owner"}]),
        rpc=rpc,
    ))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.update_personal_expense("linked-expense", server.PersonalExpenseUpdate(
            total_amount=200, occurred_on="2026-11-06", description="Conta da casa"
        ), {"user_id": "owner", "family_id": "family-a"}))
    assert exc.value.status_code == 409


def test_access_revocation_migration_preserves_rows_and_limits_rpc_execution():
    migration = (Path(server.__file__).resolve().parents[1] / "supabase/migrations/20261118151713_family_member_access_revocation_and_personal_transaction_lifecycle.sql").read_text(encoding="utf-8").lower()
    assert "add column if not exists is_active boolean not null default true" in migration
    assert "set is_active=false" in migration
    assert "delete from public.family_memberships" not in migration
    assert "delete from public.personal_income_transactions" not in migration
    assert "delete from public.personal_expense_transactions" not in migration
    assert "grant execute on function public.revoke_family_member_access(text,text,text) to service_role" in migration
    assert "revoke execute on function public.revoke_family_member_access(text,text,text) from public,anon,authenticated" in migration
    assert "deleted_at=now()" in migration


def test_transfer_history_policy_keeps_only_owner_access_after_removal():
    migration = (Path(server.__file__).resolve().parents[1] / "supabase/migrations/20261118162000_retain_personal_transfer_history_after_revocation.sql").read_text(encoding="utf-8").lower()
    assert "create policy personal_family_transfers_owner_only" in migration
    assert "owner_user_id = (select auth.uid())::text" in migration
    assert "is_active" not in migration
