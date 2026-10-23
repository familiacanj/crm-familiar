"""Backend tests for new features: due_day on categories + /bills/upcoming + /bills/paid."""
import os
import calendar
import pytest
import requests
from datetime import date, timedelta

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://familia-orcamento-1.preview.emergentagent.com").rstrip("/")
TOKEN = "test_session_token_01"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
API = f"{BASE}/api"


# ---------- due_day field on categories (POST / PUT)
class TestCategoryDueDay:
    created = []

    def teardown_method(self):
        for cid in self.created:
            requests.delete(f"{API}/categories/{cid}", headers=H)
        self.created.clear()

    def _mk(self, **extra):
        payload = {"name": "TEST_bill_" + os.urandom(3).hex(), "kind": "fixed", "icon": "flash"}
        payload.update(extra)
        r = requests.post(f"{API}/categories", headers=H, json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        self.created.append(d["category_id"])
        return d

    def test_create_with_valid_due_day(self):
        d = self._mk(due_day=15)
        assert d["due_day"] == 15

    def test_create_without_due_day_is_none(self):
        d = self._mk()
        assert d.get("due_day") is None

    def test_create_with_due_day_out_of_range(self):
        d = self._mk(due_day=32)
        assert d.get("due_day") is None
        d = self._mk(due_day=0)
        assert d.get("due_day") is None
        d = self._mk(due_day=-5)
        assert d.get("due_day") is None

    def test_update_due_day_and_clear(self):
        d = self._mk(due_day=10)
        cid = d["category_id"]
        r = requests.put(f"{API}/categories/{cid}", headers=H, json={"due_day": 25})
        assert r.status_code == 200
        assert r.json()["due_day"] == 25
        # Clear via 0
        r = requests.put(f"{API}/categories/{cid}", headers=H, json={"due_day": 0})
        assert r.status_code == 200
        assert r.json().get("due_day") is None
        # set again then clear via 99
        requests.put(f"{API}/categories/{cid}", headers=H, json={"due_day": 5})
        r = requests.put(f"{API}/categories/{cid}", headers=H, json={"due_day": 99})
        assert r.json().get("due_day") is None

    def test_month_rows_include_due_day(self):
        d = self._mk(due_day=20)
        cid = d["category_id"]
        r = requests.get(f"{API}/month/2026/10", headers=H)
        assert r.status_code == 200
        rows = r.json()["sections"]["fixed"]
        row = next(x for x in rows if x["id"] == cid)
        assert row["due_day"] == 20


# ---------- /bills/upcoming
class TestBillsUpcoming:
    created = []

    def teardown_method(self):
        for cid in self.created:
            requests.delete(f"{API}/categories/{cid}", headers=H)
        self.created.clear()

    def _mk(self, name, kind, due_day, value=0.0):
        r = requests.post(f"{API}/categories", headers=H, json={
            "name": "TEST_" + name, "kind": kind, "icon": "flash",
            "default_value": value, "due_day": due_day})
        assert r.status_code == 200
        d = r.json()
        self.created.append(d["category_id"])
        return d

    def test_bad_date_returns_400(self):
        r = requests.get(f"{API}/bills/upcoming", params={"date": "not-a-date"}, headers=H)
        assert r.status_code == 400

    def test_has_due_days_flag(self):
        # Seed category Luz has due_day=23 (per prompt), so has_due_days should already be true
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-23", "days": 7}, headers=H)
        assert r.status_code == 200
        d = r.json()
        assert d["has_due_days"] is True
        assert isinstance(d["bills"], list)

    def test_bill_within_7_days_appears(self):
        self._mk("test_due_28", "fixed", 28, value=100.0)
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-23", "days": 7}, headers=H)
        bills = r.json()["bills"]
        mine = [b for b in bills if b["category_id"] == self.created[-1]]
        assert len(mine) == 1
        b = mine[0]
        assert b["due_date"] == "2026-10-28"
        assert b["days_left"] == 5
        assert b["value"] == 100.0
        assert b["paid"] is False

    def test_bill_crosses_month_boundary(self):
        # date=2026-10-28 + 7 days -> 2026-11-04; due_day=2 should land on 2026-11-02
        self._mk("cross_boundary", "fixed", 2, value=55.0)
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-28", "days": 7}, headers=H)
        bills = r.json()["bills"]
        mine = [b for b in bills if b["category_id"] == self.created[-1]]
        # Nov 2 upcoming entry MUST exist. (An Oct 2 overdue-unpaid entry may also appear per spec.)
        nov = [b for b in mine if b["due_date"] == "2026-11-02"]
        assert len(nov) == 1, f"expected Nov 2 entry, got {mine}"
        assert nov[0]["days_left"] == 5

    def test_due_day_31_clamps_to_last_day_of_month(self):
        self._mk("day31", "fixed", 31, value=10.0)
        # Feb 2026 has 28 days
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-02-22", "days": 7}, headers=H)
        bills = r.json()["bills"]
        mine = [b for b in bills if b["category_id"] == self.created[-1]]
        assert len(mine) == 1
        assert mine[0]["due_date"] == "2026-02-28"

    def test_overdue_unpaid_included_paid_excluded(self):
        # Create a bill due_day=5 (passed in Oct 2026, today=23). It should appear as overdue (days_left<0).
        c = self._mk("overdue_test", "fixed", 5, value=42.0)
        cid = c["category_id"]
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-23", "days": 7}, headers=H)
        mine = [b for b in r.json()["bills"] if b["category_id"] == cid]
        assert len(mine) == 1
        assert mine[0]["days_left"] < 0
        assert mine[0]["paid"] is False
        # Mark paid -> should disappear
        r = requests.put(f"{API}/bills/paid", headers=H, json={
            "category_id": cid, "year": 2026, "month": 10, "paid": True})
        assert r.status_code == 200
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-23", "days": 7}, headers=H)
        mine = [b for b in r.json()["bills"] if b["category_id"] == cid]
        assert len(mine) == 0

    def test_value_reflects_month_entry_override(self):
        c = self._mk("value_test", "variable", 26, value=0.0)
        cid = c["category_id"]
        # set October override
        requests.put(f"{API}/entries", headers=H, json={
            "year": 2026, "month": 10, "ref_type": "category",
            "ref_id": cid, "value": 777.0})
        r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-23", "days": 7}, headers=H)
        mine = [b for b in r.json()["bills"] if b["category_id"] == cid]
        assert len(mine) == 1
        assert mine[0]["value"] == 777.0
        # cleanup
        requests.put(f"{API}/entries", headers=H, json={
            "year": 2026, "month": 10, "ref_type": "category",
            "ref_id": cid, "value": None})


# ---------- /bills/paid
class TestBillsPaid:
    def test_toggle_paid_flow(self):
        # Pick a seed category with due_day via "Luz" (seeded with due_day=23 per prompt)
        cats = requests.get(f"{API}/categories", headers=H).json()
        luz = next((c for c in cats if c["name"] == "Luz"), None)
        if not luz:
            pytest.skip("No Luz category in seed")
        cid = luz["category_id"]
        # Luz is already paid per prompt. Toggle off then on.
        r = requests.put(f"{API}/bills/paid", headers=H, json={
            "category_id": cid, "year": 2026, "month": 10, "paid": False})
        assert r.status_code == 200
        # Verify unpaid via upcoming
        if luz.get("due_day"):
            r = requests.get(f"{API}/bills/upcoming", params={"date": "2026-10-23", "days": 7}, headers=H)
            mine = [b for b in r.json()["bills"] if b["category_id"] == cid]
            if mine:
                assert mine[0]["paid"] is False
        # Toggle back on
        r = requests.put(f"{API}/bills/paid", headers=H, json={
            "category_id": cid, "year": 2026, "month": 10, "paid": True})
        assert r.status_code == 200

    def test_paid_unknown_category_404(self):
        r = requests.put(f"{API}/bills/paid", headers=H, json={
            "category_id": "cat_nonexistent", "year": 2026, "month": 10, "paid": True})
        assert r.status_code == 404

    def test_delete_category_removes_payments(self):
        # create cat, mark paid, delete, then recreate same id... we cannot check same id.
        r = requests.post(f"{API}/categories", headers=H, json={
            "name": "TEST_del_bill", "kind": "fixed", "icon": "flash", "due_day": 10})
        cid = r.json()["category_id"]
        requests.put(f"{API}/bills/paid", headers=H, json={
            "category_id": cid, "year": 2026, "month": 10, "paid": True})
        # delete
        r = requests.delete(f"{API}/categories/{cid}", headers=H)
        assert r.status_code == 200
        # Now trying to set paid again should 404
        r = requests.put(f"{API}/bills/paid", headers=H, json={
            "category_id": cid, "year": 2026, "month": 10, "paid": True})
        assert r.status_code == 404
