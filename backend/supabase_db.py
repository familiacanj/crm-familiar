"""Small async PostgREST adapter used by the CRM backend.

The existing API was written against Motor's collection interface. Keeping a
small compatibility layer here lets the route contracts remain stable while
the persistence layer moves from MongoDB to Supabase Postgres.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable

import httpx


class SupabaseDBError(RuntimeError):
    pass


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _projection(rows: list[dict[str, Any]], projection: dict[str, int] | None) -> list[dict[str, Any]]:
    if not projection:
        return rows

    included = {key for key, value in projection.items() if key != "_id" and value}
    excluded = {key for key, value in projection.items() if key != "_id" and not value}
    result: list[dict[str, Any]] = []
    for row in rows:
        if included:
            result.append({key: row[key] for key in included if key in row})
        else:
            result.append({key: value for key, value in row.items() if key not in excluded and key != "_id"})
    return result


def _postgrest_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def _or_expression(branches: list[dict[str, Any]]) -> str:
    expressions: list[str] = []
    for branch in branches:
        parts: list[str] = []
        for field, condition in branch.items():
            if isinstance(condition, dict):
                for operator, value in condition.items():
                    op = {"$gte": "gte", "$gt": "gt", "$lte": "lte", "$lt": "lt", "$eq": "eq"}.get(operator)
                    if op is None:
                        raise SupabaseDBError(f"Unsupported OR operator: {operator}")
                    parts.append(f"{field}.{op}.{_postgrest_scalar(value)}")
            else:
                parts.append(f"{field}.eq.{_postgrest_scalar(condition)}")
        expressions.append(parts[0] if len(parts) == 1 else f"and({','.join(parts)})")
    return f"({','.join(expressions)})"


def _filter_params(filters: dict[str, Any]) -> list[tuple[str, str]]:
    params: list[tuple[str, str]] = []
    for field, condition in filters.items():
        if field == "$or":
            params.append(("or", _or_expression(condition)))
            continue
        if isinstance(condition, dict):
            for operator, value in condition.items():
                if operator == "$exists":
                    params.append((field, "not.is.null" if value else "is.null"))
                elif operator == "$regex":
                    pattern = str(value)
                    if pattern.startswith("^"):
                        pattern = pattern[1:]
                    params.append((field, f"like.{pattern}%"))
                elif operator == "$in":
                    values = ",".join(_postgrest_scalar(item) for item in value)
                    params.append((field, f"in.({values})"))
                else:
                    op = {"$gte": "gte", "$gt": "gt", "$lte": "lte", "$lt": "lt", "$eq": "eq"}.get(operator)
                    if op is None:
                        raise SupabaseDBError(f"Unsupported filter operator: {operator}")
                    params.append((field, f"{op}.{_postgrest_scalar(value)}"))
        elif condition is None:
            params.append((field, "is.null"))
        else:
            params.append((field, f"eq.{_postgrest_scalar(condition)}"))
    return params


@dataclass
class WriteResult:
    data: list[dict[str, Any]]

    @property
    def matched_count(self) -> int:
        return len(self.data)


class SupabaseQuery:
    def __init__(
        self,
        db: "SupabaseDB",
        table: str,
        filters: dict[str, Any],
        projection: dict[str, int] | None,
    ) -> None:
        self.db = db
        self.table = table
        self.filters = filters
        self.projection = projection
        self.sorts: list[tuple[str, int]] = []

    def sort(self, field_or_pairs: str | Iterable[tuple[str, int]], direction: int = 1) -> "SupabaseQuery":
        if isinstance(field_or_pairs, str):
            self.sorts = [(field_or_pairs, direction)]
        else:
            self.sorts = list(field_or_pairs)
        return self

    async def to_list(self, limit: int = 1000) -> list[dict[str, Any]]:
        return await self.db._select(self.table, self.filters, self.projection, self.sorts, limit)

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        for row in await self.to_list():
            yield row


class SupabaseCollection:
    def __init__(self, db: "SupabaseDB", table: str) -> None:
        self.db = db
        self.table = table

    def find(self, filters: dict[str, Any] | None = None, projection: dict[str, int] | None = None) -> SupabaseQuery:
        return SupabaseQuery(self.db, self.table, filters or {}, projection)

    async def find_one(self, filters: dict[str, Any] | None = None, projection: dict[str, int] | None = None):
        rows = await self.db._select(self.table, filters or {}, projection, [], 1)
        return rows[0] if rows else None

    async def insert_one(self, document: dict[str, Any]) -> WriteResult:
        return await self.db._write("POST", self.table, body=_jsonable(document))

    async def insert_many(self, documents: list[dict[str, Any]]) -> WriteResult:
        return await self.db._write("POST", self.table, body=_jsonable(documents))

    async def update_one(self, filters: dict[str, Any], update: dict[str, Any], upsert: bool = False) -> WriteResult:
        payload = dict(update.get("$set", {}))
        for field in update.get("$unset", {}):
            payload[field] = None
        if upsert:
            for field, value in filters.items():
                if not field.startswith("$") and not isinstance(value, dict):
                    payload.setdefault(field, value)
            conflict = self.db.conflict_columns.get(self.table)
            return await self.db._upsert(self.table, _jsonable(payload), conflict)
        return await self.db._write("PATCH", self.table, params=_filter_params(filters), body=_jsonable(payload))

    async def update_many(self, filters: dict[str, Any], update: dict[str, Any]) -> WriteResult:
        payload = dict(update.get("$set", {}))
        for field in update.get("$unset", {}):
            payload[field] = None
        return await self.db._write("PATCH", self.table, params=_filter_params(filters), body=_jsonable(payload))

    async def delete_one(self, filters: dict[str, Any]) -> WriteResult:
        return await self.db._write("DELETE", self.table, params=_filter_params(filters))

    async def delete_many(self, filters: dict[str, Any]) -> WriteResult:
        return await self.db._write("DELETE", self.table, params=_filter_params(filters))

    async def count_documents(self, filters: dict[str, Any]) -> int:
        rows = await self.db._select(self.table, filters, None, [], 10000)
        return len(rows)

    async def create_index(self, *_args, **_kwargs) -> None:
        # Indexes and uniqueness are defined by the SQL migration.
        return None


class SupabaseDB:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.url = url.rstrip("/")
        self.base_url = f"{self.url}/rest/v1"
        self.client = httpx.AsyncClient(
            timeout=30,
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Profile": "public",
                "Accept-Profile": "public",
            },
        )
        self.conflict_columns = {
            "bill_payments": "family_id,category_id,year,month",
            "goal_deposits": "goal_id,year,month",
        }
        for table in (
            "profiles",
            "families",
            "members",
            "categories",
            "entries",
            "bill_payments",
            "goals",
            "goal_deposits",
            "family_invites",
        ):
            setattr(self, table, SupabaseCollection(self, table))
        self.users = self.profiles

    async def _request(self, method: str, table: str, params=None, body=None, prefer: str = "return=representation"):
        headers = {"Prefer": prefer} if prefer else None
        response = await self.client.request(
            method,
            f"{self.base_url}/{table}",
            params=params,
            json=body,
            headers=headers,
        )
        if response.status_code >= 400:
            detail = response.text[:500]
            raise SupabaseDBError(f"Supabase {method} {table} failed ({response.status_code}): {detail}")
        if not response.content:
            return []
        try:
            data = response.json()
        except ValueError:
            return []
        return data if isinstance(data, list) else [data]

    async def _select(self, table, filters, projection, sorts, limit):
        params = _filter_params(filters)
        params.append(("select", "*"))
        for field, direction in sorts:
            params.append(("order", f"{field}.{'asc' if direction >= 0 else 'desc'}"))
        params.append(("limit", str(limit)))
        rows = await self._request("GET", table, params=params, prefer="")
        return _projection(rows, projection)

    async def _write(self, method, table, params=None, body=None):
        rows = await self._request(method, table, params=params, body=body)
        return WriteResult(rows)

    async def _upsert(self, table, body, conflict):
        params = [("on_conflict", conflict)] if conflict else None
        rows = await self._request(
            "POST",
            table,
            params=params,
            body=body,
            prefer="resolution=merge-duplicates,return=representation",
        )
        return WriteResult(rows)

    async def rpc(self, function_name: str, body: dict[str, Any] | None = None):
        """Call a narrowly scoped Postgres function through PostgREST."""
        return await self._request("POST", f"rpc/{function_name}", body=body or {})

    async def close(self) -> None:
        await self.client.aclose()
