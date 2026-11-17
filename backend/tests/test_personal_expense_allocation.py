"""Financial allocation and single-entry regressions for the personal ledger."""
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
from pydantic import ValidationError

import server


class Query:
    def __init__(self, rows): self.rows = rows
    def sort(self, *_args): return self
    async def to_list(self, *_args): return [dict(row) for row in self.rows]


class Collection:
    def __init__(self, rows=()): self.rows = [dict(row) for row in rows]
    def find(self, filters=None, *_args):
        filters = filters or {}
        def matches(row):
            for key, expected in filters.items():
                actual = row.get(key)
                if isinstance(expected, dict):
                    if "$in" in expected and actual not in expected["$in"]: return False
                    if "$gte" in expected and actual < expected["$gte"]: return False
                    if "$lt" in expected and actual >= expected["$lt"]: return False
                    if "$eq" in expected and actual != expected["$eq"]: return False
                elif actual != expected:
                    return False
            return True
        return Query([row for row in self.rows if matches(row)])
    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        return next((dict(row) for row in self.rows if all(row.get(k) == v for k, v in filters.items())), None)


def make_personal_db():
    period = date(2026, 11, 1)
    return SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-test", "user_id": "adult-a", "role": "owner"}]),
        personal_financial_items=Collection([{
            "family_id": "fam-test", "owner_user_id": "adult-a", "item_id": "salary",
            "kind": "income", "name": "Salário", "default_value": 2000,
        }]),
        personal_financial_entries=Collection(),
        personal_expense_transactions=Collection([
            {"transaction_id": "exp-personal", "family_id": "fam-test", "owner_user_id": "adult-a", "occurred_on": period,
             "description": "Gasto pessoal", "total_amount": 150, "personal_amount": 150, "family_amount": 0},
            {"transaction_id": "exp-light", "family_id": "fam-test", "owner_user_id": "adult-a", "occurred_on": period,
             "description": "Conta de luz", "total_amount": 180, "personal_amount": 0, "family_amount": 180},
            {"transaction_id": "exp-mixed", "family_id": "fam-test", "owner_user_id": "adult-a", "occurred_on": period,
             "description": "Compra mista", "total_amount": 600, "personal_amount": 400, "family_amount": 200},
        ]),
        personal_income_transactions=Collection(),
        personal_family_transfers=Collection([{
            "family_id": "fam-test", "owner_user_id": "adult-a", "occurred_on": period,
            "direction": "personal_to_family", "amount": 300,
        }]),
        family_financial_movements=Collection([
            {"family_id": "fam-test", "created_by_user_id": "adult-a", "occurred_on": period,
             "movement_id": "light", "kind": "direct_family_expense", "amount": 180, "description": "Luz"},
            {"family_id": "fam-test", "created_by_user_id": "adult-a", "occurred_on": period,
             "movement_id": "mixed", "kind": "direct_family_expense", "amount": 200, "description": "Compra mista"},
            {"family_id": "fam-test", "created_by_user_id": "adult-a", "occurred_on": period,
             "movement_id": "transfer", "kind": "personal_to_family_transfer", "amount": 300, "description": "Caixa"},
        ]),
        family_reimbursements=Collection(),
    )


def test_required_five_scenarios_keep_personal_and_family_totals_separate(monkeypatch):
    db = make_personal_db()
    monkeypatch.setattr(server, "db", db)
    personal = asyncio.run(server.personal_summary_data("fam-test", "adult-a", 2026, 11))
    family = server.summarize_family_financial_movements(
        db.family_financial_movements.rows, [], [],
    )

    assert personal["income"] == 2000
    assert personal["expenses"] == 930  # saída real inclui a parcela da casa paga com dinheiro pessoal
    assert personal["personal_expenses"] == 550
    assert personal["family_paid_expenses"] == 380  # R$ 180 de luz + R$ 200 da compra mista
    assert personal["purchase_total_paid"] == 930  # cada compra total contada uma vez
    assert personal["cash_transfers_out"] == 300
    assert personal["balance"] == 770
    assert family["direct_family_expenses"] == 380
    assert family["contributions"] == 680  # R$ 300 dinheiro + R$ 380 pagos em compras
    assert family["cash_in"] == 300  # despesa paga pela pessoa não vira dinheiro no caixa
    assert family["cash_delta"] == 300
    assert family["pending_reimbursements"] == 0


def test_mixed_expense_requires_exact_split_and_valid_scope():
    valid = server.PersonalExpenseIn(
        scope="mixed", description="Compra mista", occurred_on="2026-11-16",
        total_amount=600, personal_amount=400, family_amount=200, idempotency_key="fixture-1",
    )
    assert valid.total_amount == 600
    with pytest.raises(ValidationError):
        server.PersonalExpenseIn(
            scope="mixed", description="Compra mista", occurred_on="2026-11-16",
            total_amount=600, personal_amount=400, family_amount=199, idempotency_key="fixture-2",
        )


def test_personal_expense_calls_one_atomic_rpc_and_reuses_idempotency_key(monkeypatch):
    calls = []

    async def rpc(name, body):
        calls.append((name, body))
        return [{"transaction_id": "pexp-fixture", "family_movement_id": "fmove-fixture", "idempotent": len(calls) > 1}]

    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-test", "user_id": "adult-a", "role": "member"}]),
        rpc=rpc,
    ))
    body = server.PersonalExpenseIn(
        scope="mixed", description="Compra mista", occurred_on="2026-11-16",
        total_amount=600, personal_amount=400, family_amount=200, idempotency_key="retry-key",
    )
    user = {"user_id": "adult-a", "family_id": "fam-test"}
    first = asyncio.run(server.add_personal_expense(body, user))
    second = asyncio.run(server.add_personal_expense(body, user))
    assert first["transaction_id"] == second["transaction_id"]
    assert all(call[0] == "record_personal_expense_transaction_v2" for call in calls)
    assert calls[0][1] == calls[1][1]
    assert calls[0][1]["p_family_amount"] == 200


def test_expense_migration_preserves_private_split_rls_and_does_not_auto_create_reimbursement():
    migration = (Path(server.__file__).resolve().parents[1] / "supabase/migrations/20261116190000_personal_expense_allocation.sql").read_text(encoding="utf-8").lower()
    assert "create table if not exists public.personal_expense_transactions" in migration
    assert "using (owner_user_id = (select auth.uid())::text)" in migration
    assert "family_financial_movements_member_read" in migration
    assert "security invoker" in migration
    expense_rpc = migration.split("create or replace function public.record_family_reimbursement_paid", 1)[0]
    assert "insert into public.family_reimbursements" not in expense_rpc
    assert "insert into public.family_financial_movements" in expense_rpc


def test_simplification_migration_is_additive_and_keeps_guardians_explicit():
    path = Path(server.__file__).resolve().parents[1] / "supabase/migrations/20261117190000_simplified_accounts_and_report_privacy.sql"
    migration = path.read_text(encoding="utf-8").lower()
    assert "create table if not exists public.personal_income_transactions" in migration
    assert "owner_user_id = (select auth.uid())::text" in migration
    assert "guardian_user_id = (select auth.uid())::text" in migration
    assert "current_date < (g.minor_birth_date + interval '18 years')::date" in migration
    assert "family_financial_movements_kind_check" in migration
    assert "security definer" not in migration
    assert "drop table" not in migration and "delete from" not in migration and "truncate" not in migration
    assert "revoke all on public.user_report_passwords" in migration
