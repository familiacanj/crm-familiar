"""Backend API tests for Família Orçamento."""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://familia-orcamento-1.preview.emergentagent.com").rstrip("/")
TOKEN = "test_session_token_01"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
API = f"{BASE}/api"


# ---------- auth
def test_auth_me_401_without_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401

def test_auth_me_ok():
    r = requests.get(f"{API}/auth/me", headers=H)
    assert r.status_code == 200
    d = r.json()
    assert d["user_id"] == "user_test01"
    assert d["family_id"]


# ---------- family
def test_get_family():
    r = requests.get(f"{API}/family", headers=H)
    assert r.status_code == 200
    d = r.json()
    assert d["family_id"]
    assert len(d["invite_code"]) == 6
    assert len(d["members"]) >= 4

def test_family_401():
    assert requests.get(f"{API}/family").status_code == 401


# ---------- categories
def test_list_categories():
    r = requests.get(f"{API}/categories", headers=H)
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) >= 23
    kinds = {c["kind"] for c in cats}
    assert {"income_extra", "fixed", "variable"} <= kinds

def test_category_crud():
    # create
    r = requests.post(f"{API}/categories", headers=H,
                      json={"name": "TEST_cat", "kind": "variable", "icon": "tag"})
    assert r.status_code == 200
    cid = r.json()["category_id"]
    # update
    r = requests.put(f"{API}/categories/{cid}", headers=H, json={"name": "TEST_updated"})
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_updated"
    # verify via list
    cats = requests.get(f"{API}/categories", headers=H).json()
    assert any(c["category_id"] == cid and c["name"] == "TEST_updated" for c in cats)
    # delete
    r = requests.delete(f"{API}/categories/{cid}", headers=H)
    assert r.status_code == 200
    cats = requests.get(f"{API}/categories", headers=H).json()
    assert not any(c["category_id"] == cid for c in cats)


# ---------- members
def test_member_crud():
    r = requests.post(f"{API}/members", headers=H,
                      json={"name": "TEST_mem", "color": "#000000", "default_income": 100})
    assert r.status_code == 200
    mid = r.json()["member_id"]
    r = requests.put(f"{API}/members/{mid}", headers=H,
                     json={"name": "TEST_mem2", "color": "#111111", "default_income": 200})
    assert r.status_code == 200
    assert r.json()["default_income"] == 200
    r = requests.delete(f"{API}/members/{mid}", headers=H)
    assert r.status_code == 200


# ---------- entries + month
def _first_fixed_cat():
    cats = requests.get(f"{API}/categories", headers=H).json()
    return next(c for c in cats if c["kind"] == "fixed")

def _first_var_cat():
    cats = requests.get(f"{API}/categories", headers=H).json()
    return next(c for c in cats if c["kind"] == "variable")

def _first_member():
    return requests.get(f"{API}/family", headers=H).json()["members"][0]

Y, M = 2026, 6

def test_month_endpoint():
    r = requests.get(f"{API}/month/{Y}/{M}", headers=H)
    assert r.status_code == 200
    d = r.json()
    assert d["year"] == Y and d["month"] == M
    assert set(d["sections"].keys()) == {"income", "fixed", "variable"}
    assert "balance" in d["totals"]

def test_entry_variable_override_and_remove():
    cat = _first_var_cat()
    # set
    r = requests.put(f"{API}/entries", headers=H,
                     json={"year": Y, "month": M, "ref_type": "category", "ref_id": cat["category_id"], "value": 123.45})
    assert r.status_code == 200
    d = requests.get(f"{API}/month/{Y}/{M}", headers=H).json()
    row = next(x for x in d["sections"]["variable"] if x["id"] == cat["category_id"])
    assert row["value"] == 123.45 and row["overridden"] is True
    # remove
    r = requests.put(f"{API}/entries", headers=H,
                     json={"year": Y, "month": M, "ref_type": "category", "ref_id": cat["category_id"], "value": None})
    assert r.status_code == 200
    d = requests.get(f"{API}/month/{Y}/{M}", headers=H).json()
    row = next(x for x in d["sections"]["variable"] if x["id"] == cat["category_id"])
    assert row["value"] == 0 and row["overridden"] is False

def test_entry_fixed_apply_all_removes_future_overrides():
    cat = _first_fixed_cat()
    # Put override in month M+1
    nm = M + 1
    requests.put(f"{API}/entries", headers=H,
                 json={"year": Y, "month": nm, "ref_type": "category", "ref_id": cat["category_id"], "value": 999})
    # apply_all from month M sets default + wipes future overrides
    r = requests.put(f"{API}/entries", headers=H,
                     json={"year": Y, "month": M, "ref_type": "category", "ref_id": cat["category_id"],
                           "value": 500, "apply_all": True})
    assert r.status_code == 200
    d = requests.get(f"{API}/month/{Y}/{nm}", headers=H).json()
    row = next(x for x in d["sections"]["fixed"] if x["id"] == cat["category_id"])
    assert row["value"] == 500 and row["overridden"] is False
    # cleanup: reset default to 0
    requests.put(f"{API}/entries", headers=H,
                 json={"year": Y, "month": 1, "ref_type": "category", "ref_id": cat["category_id"],
                       "value": 0, "apply_all": True})

def test_entry_member_apply_all():
    mem = _first_member()
    r = requests.put(f"{API}/entries", headers=H,
                     json={"year": Y, "month": M, "ref_type": "member", "ref_id": mem["member_id"],
                           "value": 3000, "apply_all": True})
    assert r.status_code == 200
    fam = requests.get(f"{API}/family", headers=H).json()
    m2 = next(x for x in fam["members"] if x["member_id"] == mem["member_id"])
    assert m2["default_income"] == 3000
    # reset
    requests.put(f"{API}/entries", headers=H,
                 json={"year": Y, "month": 1, "ref_type": "member", "ref_id": mem["member_id"],
                       "value": 0, "apply_all": True})

def test_entry_invalid_month():
    cat = _first_var_cat()
    r = requests.put(f"{API}/entries", headers=H,
                     json={"year": Y, "month": 13, "ref_type": "category", "ref_id": cat["category_id"], "value": 1})
    assert r.status_code == 400


# ---------- year
def test_year_endpoint():
    r = requests.get(f"{API}/year/{Y}", headers=H)
    assert r.status_code == 200
    d = r.json()
    assert len(d["months"]) == 12
    assert "breakdown" in d
    assert "totals" in d


# ---------- family join invalid
def test_family_join_invalid_code():
    # user is already in family -> join will update family_id, but code must exist first
    r = requests.post(f"{API}/family/join", headers=H, json={"code": "ZZZZZZ"})
    assert r.status_code == 404
