"""Focused unit tests for private member photos and family access metadata."""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from starlette.requests import Request

os.environ.setdefault("SUPABASE_URL", "https://unit-test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unit-test-only")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import HTTPException

import server


class Query:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    async def to_list(self, *_args):
        return [dict(row) for row in self.rows]


class Collection:
    def __init__(self, rows=()):
        self.rows = [dict(row) for row in rows]
        self.updated = []

    def find(self, *_args):
        return Query(self.rows)

    async def find_one(self, filters=None, *_args):
        filters = filters or {}
        return next((dict(row) for row in self.rows if all(row.get(k) == v for k, v in filters.items())), None)

    async def update_one(self, filters, update, **_kwargs):
        self.updated.append((filters, update))
        return SimpleNamespace(matched_count=1)


class FakeDB:
    def __init__(self):
        self.families = Collection([{"family_id": "fam-a", "name": "Família A"}])
        self.family_memberships = Collection([
            {"family_id": "fam-a", "user_id": "owner", "role": "owner", "last_access_at": "2026-11-11T12:00:00+00:00"},
            {"family_id": "fam-a", "user_id": "member", "role": "member", "last_access_at": None},
            {"family_id": "fam-a", "user_id": "auth-user", "role": "member", "last_access_at": None},
        ])
        self.profiles = Collection([
            {"user_id": "owner", "name": "Responsável", "email": "owner@example.test", "picture": "google-profile"},
            {"user_id": "member", "name": "Integrante", "email": "member@example.test", "picture": None},
            {"user_id": "auth-user", "name": "Autenticado", "email": "auth@example.test", "picture": None},
        ])
        self.users = self.profiles
        self.members = Collection([{
            "member_id": "mem-a", "family_id": "fam-a", "name": "Pessoa", "color": "#3B825C",
            "default_income": 0, "photo_path": "fam-a/mem-a/private.jpg", "linked_user_id": None,
        }])

    async def create_signed_url(self, bucket, path, expires):
        assert bucket == "family-member-photos"
        assert expires > 0
        if path.startswith("profiles/"):
            return "https://storage.example.test/signed/profile-image"
        assert path == "fam-a/mem-a/private.jpg"
        return "https://storage.example.test/signed/private-image"


def test_family_info_returns_last_access_only_to_managers_and_hides_storage_path(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(server, "db", db)

    manager_view = asyncio.run(server.family_info("fam-a", "owner"))
    member_view = asyncio.run(server.family_info("fam-a", "member"))

    assert manager_view["users"][0]["last_access_at"] == "2026-11-11T12:00:00+00:00"
    assert "last_access_at" not in member_view["users"][0]
    assert manager_view["members"][0]["photo_url"].endswith("private-image")
    assert "photo_path" not in manager_view["members"][0]


def test_image_signature_requires_content_to_match_declared_mime():
    assert server._validate_image_signature("image/jpeg", b"\xff\xd8\xffdata")
    assert server._validate_image_signature("image/png", b"\x89PNG\r\n\x1a\ndata")
    assert server._validate_image_signature("image/webp", b"RIFFxxxxWEBPdata")
    assert not server._validate_image_signature("image/png", b"\xff\xd8\xffdata")
    assert not server._validate_image_signature("image/svg+xml", b"<svg>")


def test_integrant_cannot_link_their_account_to_a_financial_person(monkeypatch):
    db = FakeDB()
    db.members = Collection([
        {"member_id": "mem-target", "family_id": "fam-a", "linked_user_id": None},
        {"member_id": "mem-other", "family_id": "fam-a", "linked_user_id": "auth-user"},
    ])
    monkeypatch.setattr(server, "db", db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.link_member_to_self("mem-target", {"family_id": "fam-a", "user_id": "auth-user"}))
    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", ["owner", "admin", "member"])
def test_profile_update_is_scoped_to_authenticated_user_and_active_family(monkeypatch, role):
    db = FakeDB()
    monkeypatch.setattr(server, "db", db)

    result = asyncio.run(server.update_own_profile(
        server.ProfileUpdate(display_name="  Sérgio  "),
        {"user_id": "member", "family_id": "fam-a", "family_role": role},
    ))

    assert result == {"display_name": "Sérgio"}
    assert db.family_memberships.updated[-1] == (
        {"family_id": "fam-a", "user_id": "member"},
        {"$set": {"display_name": "Sérgio"}},
    )


def test_profile_update_requires_existing_own_membership(monkeypatch):
    db = FakeDB()
    db.family_memberships = Collection([])
    monkeypatch.setattr(server, "db", db)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.update_own_profile(
            server.ProfileUpdate(display_name="Sérgio"),
            {"user_id": "member", "family_id": "fam-a", "family_role": "member"},
        ))
    assert exc.value.status_code == 403
    assert not db.family_memberships.updated


def test_profile_update_rejects_blank_display_name():
    with pytest.raises(ValueError):
        server.ProfileUpdate(display_name="   ")


def test_family_app_user_uses_own_private_bucket_photo(monkeypatch):
    db = FakeDB()
    db.profiles.rows[1]["profile_photo_path"] = "profiles/member/private.png"
    monkeypatch.setattr(server, "db", db)

    result = asyncio.run(server.family_info("fam-a", "member"))
    assert result["users"][1]["picture"].endswith("profile-image")


def test_profile_photo_upload_is_saved_under_authenticated_user_path(monkeypatch):
    db = FakeDB()
    uploaded = []
    deleted = []
    async def upload(bucket, path, content, content_type):
        uploaded.append((bucket, path, content, content_type))
    async def delete(bucket, path):
        deleted.append((bucket, path))
    async def signed(bucket, path, expires):
        return "https://storage.example.test/signed/new-profile"
    db.upload_private_object = upload
    db.delete_private_object = delete
    db.create_signed_url = signed
    monkeypatch.setattr(server, "db", db)
    content = b"\x89PNG\r\n\x1a\nvalid-test-image"
    async def receive():
        return {"type": "http.request", "body": content, "more_body": False}
    request = Request({"type": "http", "method": "POST", "path": "/api/auth/profile/photo", "headers": [(b"content-type", b"image/png")]}, receive)

    result = asyncio.run(server.upload_own_profile_photo(
        request,
        {"user_id": "member", "family_id": "fam-a", "profile_photo_path": "profiles/member/old.jpg"},
    ))

    assert result["photo_url"].endswith("new-profile")
    assert uploaded[0][0] == "family-member-photos"
    assert uploaded[0][1].startswith("profiles/member/")
    assert uploaded[0][2:] == (content, "image/png")
    assert deleted == [("family-member-photos", "profiles/member/old.jpg")]
    assert db.profiles.updated[-1][0] == {"user_id": "member"}


def test_profile_photo_upload_rejects_mime_signature_mismatch(monkeypatch):
    db = FakeDB()
    uploaded = []
    async def upload(*args):
        uploaded.append(args)
    db.upload_private_object = upload
    monkeypatch.setattr(server, "db", db)
    async def receive():
        return {"type": "http.request", "body": b"not-an-image", "more_body": False}
    request = Request({"type": "http", "method": "POST", "path": "/api/auth/profile/photo", "headers": [(b"content-type", b"image/png")]}, receive)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.upload_own_profile_photo(request, {"user_id": "member", "family_id": "fam-a"}))
    assert exc.value.status_code == 415
    assert uploaded == []
