"""Regressions for invite names, member separation, and family-manager authorization."""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class Query:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, *_args):
        return [dict(row) for row in self.rows]


class Memberships:
    def __init__(self, role="member", display_name="Alda"):
        self.role = role
        self.display_name = display_name

    async def find_one(self, filters=None, *_args):
        if filters and filters.get("user_id") == "user-1" and filters.get("family_id") == "family-1":
            return {"user_id": "user-1", "family_id": "family-1", "role": self.role, "display_name": self.display_name}
        return None

    def find(self, filters=None, *_args):
        if filters and filters.get("user_id") == "user-1":
            return Query([{"user_id": "user-1", "family_id": "family-1", "role": self.role, "display_name": self.display_name}])
        return Query([])


class Members:
    def __init__(self):
        self.rows = [{"member_id": "cremilda", "family_id": "family-1", "name": "Cremilda", "linked_user_id": None}]
        self.updated = []
        self.deleted = []

    async def count_documents(self, _filters):
        return len(self.rows)

    async def insert_one(self, row):
        self.rows.append(dict(row))

    async def update_one(self, filters, update):
        self.updated.append((filters, update))
        return SimpleNamespace(matched_count=1)

    async def delete_one(self, filters):
        self.deleted.append(filters)

    async def find_one(self, filters=None, projection=None):
        row = next((r for r in self.rows if all(r.get(k) == v for k, v in (filters or {}).items())), None)
        if row is None:
            return None
        result = dict(row)
        for key, value in (projection or {}).items():
            if value == 0:
                result.pop(key, None)
        result.pop("_id", None)
        return result


def member_user(role="member"):
    return {"user_id": "user-1", "family_id": "family-1", "family_role": role}


def test_member_cannot_add_edit_delete_people_or_claim_finance_person(monkeypatch):
    members = Members()
    db = SimpleNamespace(family_memberships=Memberships("member"), members=members)
    monkeypatch.setattr(server, "db", db)
    actor = member_user()

    async def exercise():
        calls = [
            server.add_member(server.MemberIn(name="Outra pessoa"), actor),
            server.update_member("cremilda", server.MemberIn(name="Cremilda"), actor),
            server.delete_member("cremilda", actor),
            server.link_member_to_self("cremilda", actor),
            server.add_category(server.CategoryIn(name="Conta", kind="fixed"), actor),
            server.update_category("category-1", server.CategoryUpdate(name="Conta"), actor),
            server.delete_category("category-1", actor),
            server.create_family_invite(actor),
            server.cancel_family_invite("invite-1", actor),
        ]
        for call in calls:
            with pytest.raises(HTTPException) as exc:
                await call
            assert exc.value.status_code == 403

    asyncio.run(exercise())
    assert [row["name"] for row in members.rows] == ["Cremilda"]
    assert members.updated == []
    assert members.deleted == []


def test_owner_and_admin_can_manage_people_but_not_linking_is_automatic(monkeypatch):
    members = Members()
    db = SimpleNamespace(family_memberships=Memberships("admin"), members=members)
    monkeypatch.setattr(server, "db", db)
    created = asyncio.run(server.add_member(server.MemberIn(name="Nova pessoa"), member_user("admin")))
    assert created["name"] == "Nova pessoa"
    assert members.rows[0]["linked_user_id"] is None


def test_family_response_prefers_membership_display_name(monkeypatch):
    class Rows:
        def __init__(self, rows):
            self.rows = rows

        def sort(self, *_args):
            return self

        async def to_list(self, *_args):
            return [dict(row) for row in self.rows]

    class Profiles:
        async def find_one(self, *_args):
            return {"family_id": "family-1", "name": "Família de Alda"}

        def find(self, *_args):
            return Rows([{"user_id": "user-1", "name": "Alda de Almeida Bittencourt", "email": "hidden@test", "picture": None}])

    class FakeDB:
        families = Profiles()
        users = Profiles()
        profiles = users
        family_memberships = Profiles()
        members = Profiles()

        async def create_signed_url(self, *_args):
            return "signed"

    fake = FakeDB()
    fake.family_memberships.find = lambda *_args: Rows([{
        "family_id": "family-1", "user_id": "user-1", "role": "member", "display_name": "Alda",
    }])
    fake.members.find = lambda *_args: Rows([])
    monkeypatch.setattr(server, "db", fake)
    info = asyncio.run(server.family_info("family-1", "user-1"))
    assert info["users"][0]["name"] == "Alda"
    assert info["users"][0]["family_role"] == "member"


def test_login_refresh_does_not_replace_family_display_name_from_google(monkeypatch):
    class Profiles:
        def __init__(self):
            self.row = {"user_id": "user-1", "email": "user@example.test", "name": "Alda", "family_id": "family-1", "family_role": "member"}
            self.update = None

        async def find_one(self, *_args):
            return dict(self.row)

        async def update_one(self, _filters, update):
            self.update = update

    class AuthResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"id": "user-1", "email": "user@example.test", "user_metadata": {"full_name": "Alda Google Sobrenome"}}

    class HttpClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, *_args, **_kwargs):
            return AuthResponse()

    class Request:
        headers = {"Authorization": "Bearer test-token"}
        url = SimpleNamespace(path="/api/auth/me", query_params={})

    profiles = Profiles()
    monkeypatch.setattr(server, "db", SimpleNamespace(profiles=profiles, family_memberships=Memberships("member", "Alda")))
    monkeypatch.setattr(server.httpx, "AsyncClient", HttpClient)
    user = asyncio.run(server.get_user(Request()))

    assert user["name"] == "Alda"
    assert profiles.update["$set"]["google_name"] == "Alda Google Sobrenome"
    assert "name" not in profiles.update["$set"]


def test_invite_migration_persists_family_name_and_binds_one_time_use():
    migration_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611140003_invite_display_name_member_management.sql"
    migration = migration_path.read_text().lower()
    assert "add column if not exists display_name text" in migration
    assert "add column if not exists google_name text" in migration
    assert "for update" in migration
    assert "used_by is not null" in migration
    assert "set used_at = now(), used_by = p_user_id" in migration
    assert "insert into public.family_memberships (family_id, user_id, role, display_name)" in migration
    assert "from anon, authenticated" in migration
    assert "drop table" not in migration
    assert "delete from public." not in migration

    permissions_path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611140004_restrict_invite_accept_rpc.sql"
    permissions = permissions_path.read_text().lower()
    assert "from public, anon, authenticated" in permissions
    assert "to service_role" in permissions


def test_invite_name_model_rejects_unbounded_input():
    assert server.InviteAccept(display_name=" Alda ").display_name == " Alda "
    with pytest.raises(Exception):
        server.InviteAccept(display_name="A" * 81)
