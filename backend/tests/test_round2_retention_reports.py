"""Round 2 regressions for private erasure requests and annual family cash."""
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
from fastapi.testclient import TestClient

import server


def _matches(row, filters):
    for key, condition in filters.items():
        actual = row.get(key)
        if not isinstance(condition, dict):
            if actual != condition:
                return False
            continue
        for operator, expected in condition.items():
            if operator == "$in" and actual not in expected:
                return False
            if operator == "$gte" and actual < expected:
                return False
            if operator == "$lt" and actual >= expected:
                return False
            if operator == "$gt" and actual <= expected:
                return False
    return True


class Query:
    def __init__(self, rows): self.rows = rows
    def sort(self, *_args): return self
    async def to_list(self, limit=1000): return [dict(row) for row in self.rows[:limit]]


class Collection:
    def __init__(self, rows=()): self.rows = [dict(row) for row in rows]
    def find(self, filters=None, *_args):
        return Query([row for row in self.rows if _matches(row, filters or {})])
    async def find_one(self, filters=None, *_args):
        row = next((row for row in self.rows if _matches(row, filters or {})), None)
        return dict(row) if row else None
    async def insert_one(self, row): self.rows.append(dict(row))
    async def update_one(self, filters, update, *_args, **_kwargs):
        row = next((row for row in self.rows if _matches(row, filters)), None)
        if row:
            row.update(update.get("$set", {}))
        elif _kwargs.get("upsert"):
            row = {key: value for key, value in filters.items() if not isinstance(value, dict)}
            row.update(update.get("$set", {}))
            self.rows.append(row)
        return SimpleNamespace(matched_count=1 if row else 0)


class AnnualDB:
    def __init__(self):
        self.family_financial_movements = Collection([
            {"movement_id": "cash-nov", "family_id": "test-family", "created_by_user_id": "adult-a", "kind": "personal_to_family_transfer", "amount": 600, "occurred_on": date(2026, 11, 5)},
            {"movement_id": "direct-nov", "family_id": "test-family", "created_by_user_id": "adult-a", "kind": "direct_family_expense", "amount": 200, "occurred_on": date(2026, 11, 6)},
            {"movement_id": "cash-expense", "family_id": "test-family", "created_by_user_id": "adult-owner", "kind": "family_cash_expense", "amount": 100, "occurred_on": date(2026, 11, 7)},
            {"movement_id": "cash-dec", "family_id": "test-family", "created_by_user_id": "adult-a", "kind": "personal_to_family_transfer", "amount": 300, "occurred_on": date(2026, 12, 5)},
            {"movement_id": "former-direct", "family_id": "test-family", "created_by_user_id": "former-adult", "kind": "direct_family_expense", "amount": 70, "occurred_on": date(2026, 11, 8)},
        ])
        self.family_reimbursements = Collection()
        self.family_reimbursement_payments = Collection()
        self.bill_payments = Collection()
        self.categories = Collection()
        self.entries = Collection()
        self.family_memberships = Collection([
            {"family_id": "test-family", "user_id": "adult-a", "role": "member", "display_name": "Adult A"},
            {"family_id": "test-family", "user_id": "adult-b", "role": "member", "display_name": "Adult B"},
            {"family_id": "test-family", "user_id": "adult-owner", "role": "owner", "display_name": "Owner"},
        ])
        self.members = Collection([
            {"family_id": "test-family", "member_id": "m-a", "linked_user_id": "adult-a", "name": "Adult A"},
            {"family_id": "test-family", "member_id": "m-b", "linked_user_id": "adult-b", "name": "Adult B"},
            {"family_id": "test-family", "member_id": "m-owner", "linked_user_id": "adult-owner", "name": "Owner"},
            {"family_id": "test-family", "member_id": "m-former", "linked_user_id": "former-adult", "name": "Former adult"},
        ])
        self.family_monthly_commitments = Collection([
            {"family_id": "test-family", "member_id": "m-a", "effective_year": 2026, "effective_month": 11, "amount": 500},
            {"family_id": "test-family", "member_id": "m-b", "effective_year": 2026, "effective_month": 11, "amount": 0},
            {"family_id": "test-family", "member_id": "m-owner", "effective_year": 2026, "effective_month": 11, "amount": 0},
        ])
    async def rpc(self, _function, _body): return [{"opening_balance": 50}]


def test_annual_family_report_carries_cash_without_counting_it_as_new_income(monkeypatch):
    db = AnnualDB()
    monkeypatch.setattr(server, "db", db)
    summary = asyncio.run(server.family_annual_financial_summary("test-family", 2026))
    nov, dec = summary["months"][10], summary["months"][11]
    assert nov["opening_balance"] == 50
    assert nov["cash_in"] == 600
    assert nov["cash_out"] == 100
    assert nov["direct_family_expenses"] == 270
    assert nov["cash_balance"] == 550
    assert dec["opening_balance"] == 550
    assert dec["cash_in"] == 300
    assert dec["cash_balance"] == 850
    assert summary["totals"] == {
        "opening_balance": 50, "cash_in": 900, "cash_out": 100,
        "closing_balance": 850, "direct_family_expenses": 270,
        "family_budget_expenses_paid": 0, "family_cash_expenses": 100, "contributions": 1170,
        "commitments": 1000, "credits": 100, "pending": 0,
    }
    assert summary["members"][0]["cash_contributions"] == 900
    assert summary["members"][0]["direct_family_expenses"] == 200
    assert summary["members"][1]["total_contributed"] == 0
    former = next(member for member in summary["members"] if member["member_id"] == "m-former")
    assert former["direct_family_expenses"] == 70
    assert former["total_contributed"] == 70


def test_deletion_request_requires_exact_confirmation_and_is_idempotent(monkeypatch):
    requests = Collection()
    grants = Collection()
    monkeypatch.setattr(server, "db", SimpleNamespace(account_data_deletion_requests=requests, platform_superadmins=grants))
    user = {"user_id": "test-user", "email": "fixture@example.invalid"}
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.create_account_deletion_request(server.AccountDeletionRequestIn(confirmation="delete"), user))
    assert error.value.status_code == 400
    created = asyncio.run(server.create_account_deletion_request(server.AccountDeletionRequestIn(confirmation="EXCLUIR MINHA CONTA"), user))
    retried = asyncio.run(server.create_account_deletion_request(server.AccountDeletionRequestIn(confirmation="EXCLUIR MINHA CONTA"), user))
    assert created["status"] == retried["status"] == "pending_review"
    assert len(requests.rows) == 1


def test_deletion_request_can_be_withdrawn_and_re_requested_by_its_owner(monkeypatch):
    requests = Collection()
    monkeypatch.setattr(server, "db", SimpleNamespace(
        account_data_deletion_requests=requests, platform_superadmins=Collection(),
    ))
    owner = {"user_id": "test-user"}
    created = asyncio.run(server.create_account_deletion_request(
        server.AccountDeletionRequestIn(confirmation="EXCLUIR MINHA CONTA"), owner
    ))
    asyncio.run(server.withdraw_account_deletion_request(created["request_id"], owner))
    assert requests.rows[0]["status"] == "withdrawn"
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.withdraw_account_deletion_request(created["request_id"], {"user_id": "other-user"}))
    assert error.value.status_code == 404
    next_request = asyncio.run(server.create_account_deletion_request(
        server.AccountDeletionRequestIn(confirmation="EXCLUIR MINHA CONTA"), owner
    ))
    assert next_request["status"] == "pending_review"
    assert len(requests.rows) == 2


def test_superadmin_cannot_enqueue_self_deletion_through_general_flow(monkeypatch):
    requests = Collection()
    grants = Collection([{"user_id": "system-admin", "role": "superadmin"}])
    monkeypatch.setattr(server, "db", SimpleNamespace(account_data_deletion_requests=requests, platform_superadmins=grants))
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.create_account_deletion_request(
            server.AccountDeletionRequestIn(confirmation="EXCLUIR MINHA CONTA"),
            {"user_id": "system-admin"},
        ))
    assert error.value.status_code == 409
    assert requests.rows == []


def test_deletion_request_migration_is_server_only_and_non_destructive():
    migration = Path(__file__).resolve().parents[2] / "supabase/migrations/20261118170000_account_deletion_requests_and_retention.sql"
    source = migration.read_text(encoding="utf-8").lower()
    assert "create table if not exists" in source
    assert "on delete restrict" in source
    assert "enable row level security" in source
    assert "revoke all" in source and "from public, anon, authenticated" in source
    assert "grant all" in source and "to service_role" in source
    assert "delete from" not in source and "truncate" not in source and "drop table" not in source


def test_private_api_responses_are_explicitly_non_cacheable():
    response = TestClient(server.app).get("/api/auth/me")
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"


def test_report_recovery_is_unavailable_without_explicit_redirect_configuration(monkeypatch):
    recovery = Collection()
    monkeypatch.setattr(server, "db", SimpleNamespace(
        user_report_passwords=Collection([{"user_id": "adult-a"}]),
        user_report_password_recovery=recovery,
    ))
    async def personal_scope(_user): return ("family-a", "adult-a")
    monkeypatch.setattr(server, "require_personal_scope", personal_scope)
    monkeypatch.delenv("REPORT_RECOVERY_REDIRECT_URL", raising=False)
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.send_report_password_recovery({"user_id": "adult-a", "email": "adult@example.invalid"}))
    assert error.value.status_code == 503
    assert recovery.rows == []


def test_report_recovery_uses_allowlisted_redirect_without_exposing_nonce_in_response(monkeypatch):
    recovery = Collection()
    passwords = Collection([{"user_id": "adult-a"}])
    monkeypatch.setattr(server, "db", SimpleNamespace(
        user_report_passwords=passwords, user_report_password_recovery=recovery,
    ))
    async def personal_scope(_user): return ("family-a", "adult-a")
    monkeypatch.setattr(server, "require_personal_scope", personal_scope)
    monkeypatch.setenv("REPORT_RECOVERY_REDIRECT_URL", "https://crm-familiar-web.vercel.app/")
    calls = {}
    class MockResponse: status_code = 200
    class MockClient:
        def __init__(self, **_kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *_args): return False
        async def post(self, url, **kwargs):
            calls.update(url=url, **kwargs)
            return MockResponse()
    monkeypatch.setattr(server.httpx, "AsyncClient", MockClient)
    result = asyncio.run(server.send_report_password_recovery({"user_id": "adult-a", "email": "adult@example.invalid"}))
    assert result == {"message": "Se o e-mail estiver configurado para receber mensagens, enviaremos instruções para recuperar a senha."}
    assert calls["url"].endswith("/auth/v1/recover")
    assert calls["params"]["redirect_to"].startswith("https://crm-familiar-web.vercel.app/?report_recovery=")
    assert len(recovery.rows) == 1


def test_report_recovery_reset_requires_recent_auth_and_consumes_nonce(monkeypatch):
    nonce = "x" * 40
    recovery = Collection([{
        "user_id": "adult-a", "token_hash": server.invite_token_hash(nonce),
        "used_at": None, "expires_at": (server.now() + server.timedelta(minutes=30)).isoformat(),
    }])
    passwords = Collection([{"user_id": "adult-a", "password_hash": "old"}])
    monkeypatch.setattr(server, "db", SimpleNamespace(
        user_report_password_recovery=recovery, user_report_passwords=passwords,
    ))
    async def personal_scope(_user): return ("family-a", "adult-a")
    monkeypatch.setattr(server, "require_personal_scope", personal_scope)
    stale = {"user_id": "adult-a", "family_id": "family-a", "auth_time": int(server.now().timestamp()) - 601}
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.reset_report_password(server.ReportRecoveryPasswordIn(password="new-report-pass", recovery_nonce=nonce), stale))
    assert error.value.status_code == 403
    assert recovery.rows[0]["used_at"] is None
    fresh = {**stale, "auth_time": int(server.now().timestamp())}
    result = asyncio.run(server.reset_report_password(server.ReportRecoveryPasswordIn(password="new-report-pass", recovery_nonce=nonce), fresh))
    assert result["report_session"]
    assert passwords.rows[0]["password_hash"] != "old"
    assert recovery.rows[0]["used_at"] is not None
