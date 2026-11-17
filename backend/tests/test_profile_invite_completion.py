"""Regression coverage for family-scoped profiles and invite completion gates."""

import asyncio
import os
import sys
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class Collection:
    def __init__(self, rows=()):
        self.rows = [dict(row) for row in rows]
        self.updates = []

    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        row = next((item for item in self.rows if all(item.get(key) == value for key, value in filters.items())), None)
        return dict(row) if row else None

    async def update_one(self, filters, update, **_kwargs):
        row = next((item for item in self.rows if all(item.get(key) == value for key, value in filters.items())), None)
        if not row:
            return SimpleNamespace(matched_count=0)
        row.update(update["$set"])
        self.updates.append((dict(filters), dict(update["$set"])))
        return SimpleNamespace(matched_count=1)

    async def update_many(self, *_args, **_kwargs):
        return SimpleNamespace(matched_count=0)


class Query:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, *_args):
        return [dict(row) for row in self.rows]


class FindCollection(Collection):
    def find(self, filters=None, *_args):
        filters = filters or {}
        def matches(row, key, value):
            if isinstance(value, dict) and "$in" in value:
                return row.get(key) in value["$in"]
            return row.get(key) == value

        rows = [row for row in self.rows if all(matches(row, key, value) for key, value in filters.items())]
        return Query(rows)


def _today():
    return server.local_today()


def test_profile_date_validation_and_relationship_normalization():
    profile = server.ProfileUpdate(display_name=" Ana ", date_of_birth="2000-02-29", relationship=" Mãe ")
    assert profile.display_name == "Ana"
    assert profile.relationship == "Mãe"
    assert profile.date_of_birth == date(2000, 2, 29)
    assert server.ProfileUpdate(display_name="Ana", relationship="  ").relationship is None
    with pytest.raises(ValidationError):
        server.ProfileUpdate(display_name="Ana", date_of_birth="2023-02-29")
    with pytest.raises(ValidationError):
        server.ProfileUpdate(display_name="Ana", date_of_birth=(_today().replace(year=_today().year + 1)).isoformat())


def test_age_calculation_handles_birthday_boundary_and_leap_day():
    assert server.calculate_age(date(2008, 11, 18), date(2026, 11, 17)) == 17
    assert server.calculate_age(date(2008, 11, 17), date(2026, 11, 17)) == 18
    assert server.calculate_age(date(2008, 2, 29), date(2026, 2, 28)) == 17
    assert server.calculate_age(date(2008, 2, 29), date(2026, 3, 1)) == 18


def test_incomplete_invitee_can_only_call_profile_completion_routes():
    assert server.profile_completion_route_allowed("/api/auth/me")
    assert server.profile_completion_route_allowed("/api/auth/profile")
    assert server.profile_completion_route_allowed("/api/auth/profile/photo")
    assert not server.profile_completion_route_allowed("/api/month/2026/11")
    assert not server.profile_completion_route_allowed("/api/family/invites/again/accept")


def test_profile_completion_saves_family_fields_and_unlocks_membership(monkeypatch):
    membership = {
        "family_id": "family-test", "user_id": "auth-user", "role": "member",
        "display_name": "Google Name", "date_of_birth": None, "relationship": None,
        "profile_completion_required": True, "report_sharing_authorized": False,
    }
    memberships = Collection([membership])
    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=memberships,
        family_minor_guardians=Collection(),
        family_report_access_audit=Collection(),
    ))

    result = asyncio.run(server.update_own_profile(
        server.ProfileUpdate(display_name="Ana", date_of_birth="2000-02-29", relationship="Mãe"),
        {"user_id": "auth-user", "family_id": "family-test"},
    ))

    assert result == {"display_name": "Ana"}
    saved = memberships.rows[0]
    assert saved["date_of_birth"] == "2000-02-29"
    assert saved["relationship"] == "Mãe"
    assert saved["profile_completion_required"] is False
    assert saved["display_name"] == "Ana"


def test_incomplete_invitee_cannot_unlock_without_birth_date_or_relationship(monkeypatch):
    membership = {
        "family_id": "family-test", "user_id": "auth-user", "role": "member",
        "display_name": "Ana", "date_of_birth": None, "relationship": None,
        "profile_completion_required": True, "report_sharing_authorized": False,
    }
    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=Collection([membership]),
        family_minor_guardians=Collection(),
        family_report_access_audit=Collection(),
    ))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.update_own_profile(
            server.ProfileUpdate(display_name="Ana", relationship="Mãe"),
            {"user_id": "auth-user", "family_id": "family-test"},
        ))
    assert exc.value.status_code == 400
    assert membership["profile_completion_required"] is True


def test_minor_cannot_edit_birth_date_to_become_adult_or_clear_it(monkeypatch):
    today = _today()
    minor_birth = today.replace(year=today.year - 17)
    adult_birth = today.replace(year=today.year - 18)
    membership = {
        "family_id": "family-test", "user_id": "minor-user", "role": "member",
        "display_name": "Minor", "date_of_birth": minor_birth.isoformat(), "relationship": "Filho",
        "profile_completion_required": False, "report_sharing_authorized": False,
    }
    memberships = Collection([membership])
    monkeypatch.setattr(server, "db", SimpleNamespace(
        family_memberships=memberships,
        family_minor_guardians=Collection(),
        family_report_access_audit=Collection(),
    ))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.update_own_profile(
            server.ProfileUpdate(display_name="Minor", date_of_birth=adult_birth.isoformat(), relationship="Filho"),
            {"user_id": "minor-user", "family_id": "family-test"},
        ))
    assert exc.value.status_code == 403
    assert membership["date_of_birth"] == minor_birth.isoformat()

    with pytest.raises(HTTPException) as clear_exc:
        asyncio.run(server.update_own_profile(
            server.ProfileUpdate(display_name="Minor", date_of_birth=None, relationship="Filho"),
            {"user_id": "minor-user", "family_id": "family-test"},
        ))
    assert clear_exc.value.status_code == 400
    assert membership["date_of_birth"] == minor_birth.isoformat()


def test_family_info_keeps_relationship_per_membership_and_explains_existing_finance_link(monkeypatch):
    families = FindCollection([{"family_id": "family-test", "name": "Família Teste"}])
    memberships = FindCollection([{
        "family_id": "family-test", "user_id": "auth-user", "role": "member",
        "display_name": "Ana", "relationship": "Mãe", "last_access_at": None,
    }])
    profiles = FindCollection([{
        "user_id": "auth-user", "name": "Ana", "email": "ana@example.test", "picture": None,
    }])
    members = FindCollection([{
        "member_id": "budget-person-1", "family_id": "family-test", "linked_user_id": "auth-user",
        "name": "Ana", "order": 0,
    }])
    monkeypatch.setattr(server, "db", SimpleNamespace(
        families=families, family_memberships=memberships, users=profiles, members=members,
    ))

    info = asyncio.run(server.family_info("family-test", "auth-user"))
    assert len(info["users"]) == 1
    assert len(info["members"]) == 1
    assert info["users"][0]["relationship"] == "Mãe"
    assert info["users"][0]["financial_member_id"] == "budget-person-1"
    assert info["users"][0]["financial_member_name"] == "Ana"


def test_invite_acceptance_uses_atomic_rpc_and_does_not_create_financial_person(monkeypatch):
    class DB:
        def __init__(self):
            self.rpc_calls = []
            self.members = Collection()

        async def rpc(self, name, args):
            self.rpc_calls.append((name, args))
            return [{"family_id": "family-test", "invite_id": "invite-test"}]

    db = DB()
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "family_info", lambda *_args: asyncio.sleep(0, result={"family_id": "family-test"}))

    result = asyncio.run(server.accept_family_invite(
        "test-token", server.InviteAccept(), {"user_id": "auth-user"},
    ))

    assert result["family_id"] == "family-test"
    assert db.rpc_calls[0][0] == "accept_family_invite"
    assert db.rpc_calls[0][1]["p_user_id"] == "auth-user"
    assert db.members.rows == []


def test_profile_completion_migration_is_additive_and_preserves_atomic_invites():
    migration = (Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261117193000_invite_profile_completion.sql").read_text().lower()
    assert "add column if not exists relationship text" in migration
    assert "profile_completion_required boolean not null default false" in migration
    assert "profile_completion_required\n  )" in migration
    assert "profile_completion_required" in migration and "    true" in migration
    assert "for update" in migration
    assert "invitation.used_at is not null or invitation.used_by is not null" in migration
    assert "invitation.expires_at <= now()" in migration
    assert "user_already_member" in migration
    assert "user_elevated_cannot_join" in migration
    assert "from anon, authenticated" in migration
    assert "to service_role" in migration
    assert "insert into public.members" not in migration
    assert "drop table" not in migration
    assert "delete from public." not in migration
