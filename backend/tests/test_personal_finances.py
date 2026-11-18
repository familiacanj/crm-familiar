"""Owner isolation regressions for the additive private-finances phase."""
import asyncio
from io import BytesIO
import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

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
                if isinstance(expected, dict) and "$in" in expected:
                    if actual not in expected["$in"]:
                        return False
                elif actual != expected:
                    return False
            return True
        return Query([row for row in self.rows if matches(row)])
    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        row = next((row for row in self.rows if all(
            row.get(k) in v["$in"] if isinstance(v, dict) and "$in" in v else row.get(k) == v
            for k, v in filters.items()
        )), None)
        return dict(row) if row else None
    async def insert_one(self, row): self.rows.append(dict(row))
    async def update_one(self, filters, update, upsert=False):
        row = next((row for row in self.rows if all(row.get(k) == v for k, v in filters.items())), None)
        if row:
            row.update(update.get("$set", {}))
            return SimpleNamespace(matched_count=1)
        if upsert:
            self.rows.append({**filters, **update.get("$set", {})})
            return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)
    async def delete_one(self, filters):
        self.rows[:] = [row for row in self.rows if not all(row.get(k) == v for k, v in filters.items())]


def test_private_month_summary_is_owner_only_even_for_family_manager(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "owner", "role": "owner"}]),
        personal_financial_items=Collection([
            {"family_id": "fam-a", "owner_user_id": "owner", "item_id": "salary-owner", "kind": "income", "name": "Salário", "default_value": 2000},
            {"family_id": "fam-a", "owner_user_id": "member", "item_id": "salary-member", "kind": "income", "name": "Salário privado", "default_value": 3000},
        ]),
        personal_financial_entries=Collection([
            {"family_id": "fam-a", "owner_user_id": "member", "item_id": "salary-member", "year": 2026, "month": 11, "value": 3500},
        ]),
        personal_expense_transactions=Collection(), personal_income_transactions=Collection(), personal_family_transfers=Collection(),
        family_financial_movements=Collection(), family_reimbursements=Collection(), family_reimbursement_payments=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.personal_summary(2026, 11, {"user_id": "owner", "family_id": "fam-a", "family_role": "owner"}))
    assert result["income"] == 0
    assert result["planned_income"] == 2000
    assert [item["item_id"] for item in result["items"]] == ["salary-owner"]
    assert "Salário privado" not in repr(result)


def test_personal_write_cannot_target_another_users_item(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "member-a", "role": "member"}]),
        personal_financial_items=Collection([
            {"family_id": "fam-a", "owner_user_id": "member-b", "item_id": "private-b", "kind": "variable", "name": "Privado", "default_value": 0},
        ]),
        personal_financial_entries=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.set_personal_entry("private-b", server.PersonalEntryIn(year=2026, month=11, value=80),
                                              {"user_id": "member-a", "family_id": "fam-a"}))
    assert exc.value.status_code == 404
    assert db.personal_financial_entries.rows == []


def test_personal_endpoint_requires_active_family_membership(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(family_memberships=Collection()))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.require_personal_scope({"user_id": "user-a", "family_id": "fam-a"}))
    assert exc.value.status_code == 403


def test_personal_list_and_year_include_only_the_authenticated_owner(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "owner", "role": "owner"}]),
        personal_financial_items=Collection([
            {"family_id": "fam-a", "owner_user_id": "owner", "item_id": "own", "kind": "income", "name": "Salário", "default_value": 2000},
            {"family_id": "fam-a", "owner_user_id": "member", "item_id": "other", "kind": "income", "name": "Privado de outra pessoa", "default_value": 4000},
        ]),
        personal_financial_entries=Collection(),
        personal_expense_transactions=Collection(), personal_income_transactions=Collection(), personal_family_transfers=Collection(),
        family_financial_movements=Collection(), family_reimbursements=Collection(), family_reimbursement_payments=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    user = {"user_id": "owner", "family_id": "fam-a", "family_role": "owner"}
    listed = asyncio.run(server.list_personal_items(user))
    annual = asyncio.run(server.personal_year(2026, user))
    assert [item["item_id"] for item in listed] == ["own"]
    assert annual["totals"]["income"] == 0
    assert "Privado de outra pessoa" not in repr(annual)


def test_monthly_override_does_not_mutate_recurring_salary(monkeypatch):
    item = {"family_id": "fam-a", "owner_user_id": "user-a", "item_id": "salary", "kind": "income", "name": "Salário", "default_value": 2000}
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
        personal_financial_items=Collection([item]),
        personal_financial_entries=Collection(),
        personal_expense_transactions=Collection(), personal_income_transactions=Collection(), personal_family_transfers=Collection(),
        family_financial_movements=Collection(), family_reimbursements=Collection(), family_reimbursement_payments=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    asyncio.run(server.set_personal_entry("salary", server.PersonalEntryIn(year=2026, month=11, value=2100),
                                          {"user_id": "user-a", "family_id": "fam-a"}))
    nov = asyncio.run(server.personal_summary(2026, 11, {"user_id": "user-a", "family_id": "fam-a"}))
    dec = asyncio.run(server.personal_summary(2026, 12, {"user_id": "user-a", "family_id": "fam-a"}))
    assert nov["income"] == 0
    assert dec["income"] == 0
    assert nov["planned_income"] == 2100
    assert dec["planned_income"] == 2000
    assert item["default_value"] == 2000


def test_personal_year_balance_includes_transfer_outflows(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
    ))

    async def summary(_family_id, _user_id, year, month):
        return {"year": year, "month": month, "income": 0,
                "expenses": 140 if month == 11 else 0,
                "personal_expenses": 140 if month == 11 else 0,
                "family_paid_expenses": 0,
                "cash_transfers_out": 800 if month == 11 else 0,
                "transfers_received": 0, "reimbursements_received": 0,
                "total_outflows": 940 if month == 11 else 0,
                "balance": -940 if month == 11 else 0, "items": []}

    monkeypatch.setattr(server, "personal_summary_data", summary)
    annual = asyncio.run(server.personal_year(2026, {"user_id": "user-a", "family_id": "fam-a"}))
    assert annual["totals"]["income"] == 0
    assert annual["totals"]["expenses"] == 140
    assert annual["totals"]["cash_transfers_out"] == 800
    assert annual["totals"]["total_outflows"] == 940
    assert annual["totals"]["balance"] == -940
    assert annual["months"][10]["expenses"] == 140
    assert annual["months"][10]["cash_transfers_out"] == 800
    assert annual["months"][10]["status"] == "NEGATIVO"


def test_personal_excel_and_pdf_html_report_same_effective_cash_components(monkeypatch):
    months = [{
        "month": month, "income": 0, "expenses": 0, "personal_expenses": 0,
        "family_paid_expenses": 0, "cash_transfers_out": 0, "transfers_received": 0,
        "reimbursements_received": 0, "total_outflows": 0, "fixed": 0,
        "variable": 0, "balance": 0, "items": [],
    } for month in range(1, 13)]
    months[10].update({
        "income": 2000, "expenses": 250, "personal_expenses": 150,
        "family_paid_expenses": 100, "cash_transfers_out": 300,
        "transfers_received": 0, "reimbursements_received": 0,
        "total_outflows": 550, "balance": 1450,
    })
    data = {
        "year": 2026, "months": months,
        "totals": {
            "income": 2000, "expenses": 250, "personal_expenses": 150,
            "family_paid_expenses": 100, "cash_transfers_out": 300,
            "transfers_received": 0, "reimbursements_received": 0,
            "total_outflows": 550, "balance": 1450, "pct": 0.125,
        },
    }

    async def personal_year(_year, _user):
        return data

    async def personal_scope(_user):
        return "family-a", "adult-a"

    monkeypatch.setattr(server, "personal_year", personal_year)
    monkeypatch.setattr(server, "require_personal_scope", personal_scope)
    monkeypatch.setattr(server, "db", SimpleNamespace(
        personal_financial_items=Collection(), personal_financial_entries=Collection(),
    ))
    user = {"user_id": "adult-a", "family_id": "family-a"}
    xlsx = asyncio.run(server.export_personal_xlsx(2026, user))

    async def read_stream(response):
        return b"".join([chunk async for chunk in response.body_iterator])

    workbook = asyncio.run(read_stream(xlsx))
    from openpyxl import load_workbook
    sheet = load_workbook(BytesIO(workbook), data_only=True).active
    rows = {sheet.cell(row, 1).value: row for row in range(1, sheet.max_row + 1)}
    assert sheet.cell(rows["DESPESAS PESSOAIS"], 15).value == 150
    assert sheet.cell(rows["DESPESAS DA CASA PAGAS POR MIM"], 15).value == 100
    assert sheet.cell(rows["TRANSFERIDO PARA O CAIXA FAMILIAR"], 15).value == 300
    assert sheet.cell(rows["SAÍDAS TOTAIS"], 15).value == 550
    assert sheet.cell(rows["SALDO PESSOAL"], 15).value == 1450

    html = asyncio.run(server.export_personal_html(2026, user))["html"]
    for label, amount in [
        ("Despesas pessoais", "R$ 150,00"),
        ("Despesas da casa pagas por mim", "R$ 100,00"),
        ("Transferido ao caixa familiar", "R$ 300,00"),
        ("Saídas totais", "R$ 550,00"),
        ("Saldo pessoal", "R$ 1.450,00"),
    ]:
        assert label in html and amount in html


def test_migration_is_additive_owner_rls_and_does_not_reclassify_existing_entries():
    migration = (Path(server.__file__).resolve().parents[1] / "supabase/migrations/202611150001_personal_finances.sql").read_text(encoding="utf-8")
    assert "create table if not exists public.personal_financial_items" in migration
    assert "create table if not exists public.personal_financial_entries" in migration
    assert "alter table public.personal_financial_items enable row level security" in migration
    assert "owner_user_id = auth.uid()::text" in migration
    assert "revoke all on public.personal_financial_items, public.personal_financial_entries from anon" in migration
    assert "grant select, insert, update, delete" in migration
    assert "insert into public.entries" not in migration.lower()
    assert "update public.entries" not in migration.lower()
    assert "delete from public.entries" not in migration.lower()
    assert "delete from" not in migration.lower()
    source = Path(server.__file__).read_text(encoding="utf-8")
    year_table = source.split("async def year_table", 1)[1].split("def money", 1)[0]
    assert "personal_financial" not in year_table


def test_direct_family_expense_counts_as_contribution_without_cash_out():
    summary = server.summarize_family_financial_movements(
        [
            {"kind": "cash_contribution", "amount": 9000},
            {"kind": "direct_family_expense", "amount": 300},
        ],
        [{"status": "pending", "amount": 300}],
        [],
    )
    assert summary["contributions"] == 9300
    assert summary["cash_in"] == 9000
    assert summary["direct_family_expenses"] == 300
    assert summary["cash_delta"] == 9000
    assert summary["operational_expenses"] == 300
    assert summary["pending_reimbursements"] == 300


def test_personal_family_transfers_change_aggregate_cash_without_exposing_private_rows():
    summary = server.summarize_family_financial_movements(
        [
            {"kind": "personal_to_family_transfer", "amount": 500},
            {"kind": "family_to_personal_transfer", "amount": 120},
            {"kind": "cash_contribution", "amount": 9000},
        ],
        [],
        [],
    )
    assert summary["personal_to_family_transfers"] == 500
    assert summary["family_to_personal_transfers"] == 120
    assert summary["cash_in"] == 9500
    assert summary["cash_delta"] == 9380
    assert summary["contributions"] == 9500


def test_family_financial_movement_is_scoped_to_membership_and_rpc_key(monkeypatch):
    calls = []

    async def rpc(name, payload):
        calls.append((name, payload))
        return [{"movement_id": "move-1", "idempotent": len(calls) > 1}]

    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "owner"}]),
        rpc=rpc,
    )
    monkeypatch.setattr(server, "db", db)
    body = server.FamilyMovementIn(
        kind="cash_contribution", amount=9000, occurred_on="2026-11-14",
        description="Contribuição mensal", idempotency_key="salary-2026-11",
    )
    first = asyncio.run(server.add_family_financial_movement(body, {"user_id": "user-a", "family_id": "fam-a"}))
    second = asyncio.run(server.add_family_financial_movement(body, {"user_id": "user-a", "family_id": "fam-a"}))
    assert first["movement_id"] == second["movement_id"]
    assert calls[0][0] == "record_family_financial_movement"
    assert calls[0][1]["p_idempotency_key"] == calls[1][1]["p_idempotency_key"]


def test_member_cannot_change_shared_budget_entries(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "member-a", "role": "member"}]),
        entries=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.set_entry(server.EntryIn(year=2026, month=11, ref_type="category", ref_id="rent", value=100),
                                     {"user_id": "member-a", "family_id": "fam-a"}))
    assert exc.value.status_code == 403
    assert db.entries.rows == []


def test_annual_and_export_routes_require_report_session(monkeypatch):
    async def noop(): return None
    monkeypatch.setattr(server, "link_card_owners", noop)
    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "adult-a", "role": "owner", "is_active": True}]),
        close=noop,
    ))
    server.app.dependency_overrides[server.get_user] = lambda: {
        "user_id": "adult-a", "family_id": "fam-a", "family_role": "owner",
    }
    try:
        with TestClient(server.app) as client:
            for path in ("/api/year/2026", "/api/personal/year/2026", "/api/export/2026.xlsx", "/api/personal/export/2026.xlsx"):
                response = client.get(path)
                assert response.status_code == 423, path
    finally:
        server.app.dependency_overrides.clear()


def test_report_session_is_signed_scoped_and_expiring(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only-report-key")
    user = {"user_id": "adult-a", "family_id": "fam-a"}
    token = server.issue_report_session(user)
    assert server.verify_report_session(token, user)
    assert not server.verify_report_session(token, {"user_id": "adult-b", "family_id": "fam-a"})
    assert not server.verify_report_session(token, {"user_id": "adult-a", "family_id": "other-family"})


def test_owner_report_list_only_includes_explicit_consent_and_designated_minor(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([
            {"family_id": "fam-a", "user_id": "owner", "role": "owner", "date_of_birth": "1980-01-01"},
            {"family_id": "fam-a", "user_id": "adult-ok", "role": "member", "date_of_birth": "2000-01-01", "report_sharing_authorized": True, "display_name": "Adulto autorizado"},
            {"family_id": "fam-a", "user_id": "adult-private", "role": "admin", "date_of_birth": "1990-01-01", "report_sharing_authorized": False},
            {"family_id": "fam-a", "user_id": "minor", "role": "member", "date_of_birth": "2015-01-01"},
        ]),
        family_minor_guardians=Collection([{"family_id": "fam-a", "minor_user_id": "minor", "guardian_user_id": "owner"}]),
        profiles=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    reports = asyncio.run(server.eligible_private_reports({"user_id": "owner", "family_id": "fam-a", "role": "owner"}))
    assert {row["user_id"] for row in reports} == {"adult-ok", "minor"}


def test_admin_cannot_read_an_adult_private_report_even_if_profile_consent_is_true(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([
            {"family_id": "fam-a", "user_id": "admin", "role": "admin", "date_of_birth": "1980-01-01"},
            {"family_id": "fam-a", "user_id": "adult", "role": "member", "date_of_birth": "2000-01-01", "report_sharing_authorized": True},
        ]),
        family_minor_guardians=Collection(), profiles=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.authorized_member_report("adult", 2026, {"user_id": "admin", "family_id": "fam-a", "role": "admin"}))
    assert exc.value.status_code == 403


def test_personal_family_transfer_is_scoped_and_idempotent(monkeypatch):
    calls = []

    async def rpc(name, payload):
        calls.append((name, payload))
        return [{"transfer_id": "xfer-1", "family_movement_id": "move-1", "idempotent": len(calls) > 1}]

    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
        rpc=rpc,
    )
    monkeypatch.setattr(server, "db", db)
    body = server.FamilyTransferIn(
        direction="personal_to_family", amount=500, occurred_on="2026-11-14",
        description="Ajuste do orçamento", idempotency_key="transfer-2026-11",
    )
    user = {"user_id": "user-a", "family_id": "fam-a"}
    first = asyncio.run(server.add_personal_family_transfer(body, user))
    second = asyncio.run(server.add_personal_family_transfer(body, user))
    assert first["transfer_id"] == second["transfer_id"]
    assert calls[0][0] == "record_personal_family_transfer"
    assert calls[0][1]["p_idempotency_key"] == calls[1][1]["p_idempotency_key"]


def test_member_cannot_pay_family_reimbursement(monkeypatch):
    async def rpc(*_args):
        raise AssertionError("a member must be rejected before the RPC")

    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "member", "role": "member"}]),
        rpc=rpc,
    )
    monkeypatch.setattr(server, "db", db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.pay_family_reimbursement(
            "reimb-1", server.ReimbursementPaymentIn(idempotency_key="pay-1"),
            {"user_id": "member", "family_id": "fam-a"},
        ))
    assert exc.value.status_code == 403


def test_contribution_rules_are_private_to_the_owner(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "owner", "role": "owner"}]),
        family_contribution_rules=Collection([
            {"rule_id": "own-rule", "family_id": "fam-a", "owner_user_id": "owner", "label": "Casa", "amount": 9000},
            {"rule_id": "other-rule", "family_id": "fam-a", "owner_user_id": "other", "label": "Privada", "amount": 3000},
        ]),
    )
    monkeypatch.setattr(server, "db", db)
    rows = asyncio.run(server.list_family_contribution_rules({"user_id": "owner", "family_id": "fam-a"}))
    assert [row["rule_id"] for row in rows] == ["own-rule"]
    assert "Privada" not in repr(rows)


def test_contribution_rule_retry_is_idempotent(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "user-a", "role": "member"}]),
        family_contribution_rules=Collection(),
    )
    monkeypatch.setattr(server, "db", db)
    body = server.ContributionRuleIn(
        label="Salário", amount=9000, day_of_month=5, idempotency_key="rule:salary:user-a",
    )
    user = {"user_id": "user-a", "family_id": "fam-a"}
    first = asyncio.run(server.add_family_contribution_rule(body, user))
    second = asyncio.run(server.add_family_contribution_rule(body, user))
    assert first["rule_id"] == second["rule_id"]
    assert len(db.family_contribution_rules.rows) == 1


def test_reimbursements_are_private_to_requester_but_managers_see_family_queue(monkeypatch):
    db = SimpleNamespace(
        family_memberships=Collection([{"family_id": "fam-a", "user_id": "member-a", "role": "member"}]),
        family_reimbursements=Collection([
            {"reimbursement_id": "own", "family_id": "fam-a", "requested_by_user_id": "member-a", "status": "pending"},
            {"reimbursement_id": "other", "family_id": "fam-a", "requested_by_user_id": "member-b", "status": "pending"},
        ]),
    )
    monkeypatch.setattr(server, "db", db)
    own = asyncio.run(server.list_family_reimbursements({"user_id": "member-a", "family_id": "fam-a"}))
    assert [row["reimbursement_id"] for row in own] == ["own"]

    db.family_memberships.rows[0]["role"] = "admin"
    all_requests = asyncio.run(server.list_family_reimbursements({"user_id": "member-a", "family_id": "fam-a"}))
    assert {row["reimbursement_id"] for row in all_requests} == {"own", "other"}


def test_shared_finance_migration_has_owner_rls_and_atomic_idempotency():
    migration = (Path(server.__file__).resolve().parents[1] / "supabase/migrations/202611150001_personal_finances.sql").read_text(encoding="utf-8")
    for table in (
        "family_contribution_rules",
        "family_financial_movements",
        "family_reimbursements",
        "family_reimbursement_payments",
    ):
        assert f"alter table public.{table} enable row level security" in migration
    assert "unique (family_id, idempotency_key)" in migration
    assert "on conflict on constraint family_financial_movements_family_id_idempotency_key_key do nothing" in migration
    assert "on conflict on constraint family_reimbursement_payments_reimbursement_id_key do nothing" in migration
    assert "returning public.family_reimbursements.reimbursement_id" in migration
    assert "where family_reimbursements.reimbursement_id" in migration
    assert "Categoria não pertence à família" in migration
    assert "security invoker" in migration
    assert "revoke execute on function public.record_family_financial_movement" in migration
    assert "revoke insert, update, delete on public.family_contribution_rules" in migration
    assert "unique (family_id, owner_user_id, idempotency_key)" in migration


def test_personal_family_transfer_migration_links_private_and_family_sides():
    migration = (Path(server.__file__).resolve().parents[1] / "supabase/migrations/20261115135526_personal_family_transfers.sql").read_text(encoding="utf-8")
    assert "create table if not exists public.personal_family_transfers" in migration
    assert "family_movement_id text not null unique references public.family_financial_movements" in migration
    assert "alter table public.personal_family_transfers enable row level security" in migration
    assert "owner_user_id = (select auth.uid())::text" in migration
    assert "personal_to_family_transfer" in migration
    assert "family_to_personal_transfer" in migration
    assert "on conflict on constraint personal_family_transfers_idempotency_key_unique do nothing" in migration
    assert "security invoker" in migration
    assert "grant execute on function public.record_personal_family_transfer" in migration
