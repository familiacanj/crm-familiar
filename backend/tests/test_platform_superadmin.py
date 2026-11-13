"""Authorization and privacy regressions for global platform administration."""

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


class Collection:
    def __init__(self, rows=()):
        self.rows = [dict(row) for row in rows]
        self.inserted = []

    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        return next((dict(row) for row in self.rows if all(row.get(k) == v for k, v in filters.items())), None)

    def find(self, *_args):
        return self

    def sort(self, *_args):
        return self

    async def to_list(self, *_args):
        return [dict(row) for row in self.rows]

    async def insert_one(self, row):
        self.inserted.append(dict(row))


class AdminDB:
    def __init__(self, grants=()):
        self.platform_superadmins = Collection(grants)
        self.platform_admin_audit = Collection()
        self.rpc_calls = []

    async def rpc(self, name, body=None):
        self.rpc_calls.append((name, body))
        if name == "platform_admin_overview":
            return [{"families_count": 4, "users_count": 7, "users_without_family_count": 2,
                     "families_without_members_count": 0, "pending_invites_count": 1}]
        if name == "platform_admin_list_families":
            return [{"family_id": "fam-a", "family_name": "Família A", "created_at": "2026-11-13T00:00:00Z",
                     "member_count": 2, "active_invites_count": 1, "status": "active"}]
        raise AssertionError(f"Unexpected RPC {name}")


def test_ungranted_user_is_denied_even_if_frontend_claims_superadmin(monkeypatch):
    monkeypatch.setattr(server, "db", AdminDB())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.require_platform_superadmin({"user_id": "ordinary-user", "is_superadmin": True}))
    assert exc.value.status_code == 403


def test_grant_is_bound_to_authenticated_user_id(monkeypatch):
    monkeypatch.setattr(server, "db", AdminDB([{"user_id": "authorized-user", "role": "superadmin"}]))
    result = asyncio.run(server.require_platform_superadmin({"user_id": "authorized-user"}))
    assert result["user_id"] == "authorized-user"


def test_overview_uses_aggregate_rpc_and_records_audit_without_finance_rows(monkeypatch):
    db = AdminDB([{"user_id": "authorized-user", "role": "superadmin"}])
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.platform_admin_overview({"user_id": "authorized-user"}))
    assert result["families_count"] == 4
    assert result["users_count"] == 7
    assert db.rpc_calls == [("platform_admin_overview", None)]
    assert db.platform_admin_audit.inserted[0]["action"] == "platform.dashboard.viewed"


def test_family_directory_returns_only_basic_admin_metadata(monkeypatch):
    db = AdminDB([{"user_id": "authorized-user", "role": "superadmin"}])
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.platform_admin_families(q=None, page=1, per_page=25, user={"user_id": "authorized-user"}))
    row = result["items"][0]
    assert set(row) == {"family_id", "family_name", "created_at", "member_count", "active_invites_count", "status"}
    assert not any("balance" in key or "entry" in key or "finance" in key for key in row)
    assert db.platform_admin_audit.inserted[0]["action"] == "platform.families.listed"


def test_admin_store_failure_denies_access_closed(monkeypatch):
    class BrokenCollection:
        async def find_one(self, *_args, **_kwargs):
            raise RuntimeError("storage unavailable")

    monkeypatch.setattr(server, "db", SimpleNamespace(platform_superadmins=BrokenCollection()))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.require_platform_superadmin({"user_id": "authorized-user"}))
    assert exc.value.status_code == 503


def test_all_admin_api_routes_require_server_side_grant():
    paths = {
        "/api/platform-admin/overview",
        "/api/platform-admin/families",
        "/api/platform-admin/audit",
    }
    routes = {route.path: route for route in server.app.routes if getattr(route, "path", None) in paths}
    assert set(routes) == paths
    for route in routes.values():
        assert any(dependency.call is server.require_platform_superadmin for dependency in route.dependant.dependencies)


def test_migration_has_private_rls_and_verified_uuid_bootstrap_only():
    migration = (Path(__file__).resolve().parents[2] / "supabase/migrations/202611140001_platform_superadmin.sql").read_text(encoding="utf-8")
    assert "alter table public.platform_superadmins enable row level security" in migration
    assert "revoke all on public.platform_superadmins" in migration
    assert "grant all on public.platform_superadmins" in migration and "to service_role" in migration
    assert "email_confirmed_at is not null" in migration
    assert "f4f0c80e-79b0-4ec0-8e57-159c3cedb914" in migration
    assert "ajudapopular@gmail.com" in migration
    assert "delete from" not in migration.lower()
    rpc = migration.split("create or replace function public.platform_admin_list_families", 1)[1]
    assert "public.entries" not in rpc and "personal_financial" not in rpc and "shared_expense_transactions" not in rpc


def test_staging_bootstrap_resolves_only_confirmed_owner_inside_staging_database():
    script = (Path(__file__).resolve().parents[2] / "supabase/staging/bootstrap_platform_superadmin.sql").read_text(encoding="utf-8")
    assert "STAGING ONLY" in script
    assert "lower(email) = 'ajudapopular@gmail.com'" in script
    assert "email_confirmed_at is not null" in script
    assert "v_user_count <> 1" in script
    assert "insert into public.platform_superadmins" in script
    assert "f4f0c80e-79b0-4ec0-8e57-159c3cedb914" not in script
