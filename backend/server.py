from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import random
import hashlib
import secrets
import string
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
from urllib.parse import quote

from supabase_db import SupabaseDB, SupabaseDBError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", SUPABASE_SERVICE_ROLE_KEY)
CRM_PUBLIC_URL = os.environ.get("CRM_PUBLIC_URL", "https://crm-familiar-web.vercel.app").rstrip("/")
db = SupabaseDB(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def invite_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


NOID = {"_id": 0}

# ---------------------------------------------------------------- seed data
SEED_CATEGORIES = [
    ("income_extra", "Outras rendas (extra, 13º...)", "gift"),
    ("fixed", "Aluguel / Financiamento", "home-city"),
    ("fixed", "Condomínio", "office-building"),
    ("fixed", "Água", "water"),
    ("fixed", "Luz", "flash"),
    ("fixed", "Gás", "fire"),
    ("fixed", "Internet / Celular", "wifi"),
    ("fixed", "IPTU", "file-document"),
    ("fixed", "IPVA", "car"),
    ("fixed", "Seguro (casa/carro)", "shield-check"),
    ("fixed", "Plano de saúde", "hospital-box"),
    ("fixed", "Escola / Creche", "school"),
    ("fixed", "Assinaturas (streaming etc.)", "television-play"),
    ("variable", "Cartão de crédito", "credit-card"),
    ("variable", "Mercado", "cart"),
    ("variable", "Combustível / Transporte", "gas-station"),
    ("variable", "Farmácia", "pill"),
    ("variable", "Lazer / Restaurantes", "party-popper"),
    ("variable", "Manutenção casa/carro", "wrench"),
    ("variable", "Outros gastos", "dots-horizontal-circle"),
]


# ---------------------------------------------------------------- models
class FamilyCreate(BaseModel):
    name: str


class FamilyJoin(BaseModel):
    code: str


class InviteAccept(BaseModel):
    display_name: Optional[str] = None


class MemberIn(BaseModel):
    name: str
    color: str = "#3B825C"
    default_income: float = 0


class CategoryIn(BaseModel):
    name: str
    kind: Literal["income_extra", "fixed", "variable"]
    icon: str = "tag"
    default_value: float = 0
    member_id: Optional[str] = None  # who this expense belongs to (e.g. credit card owner)
    due_day: Optional[int] = None  # day of month the bill is due (1-31)


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    default_value: Optional[float] = None
    member_id: Optional[str] = None  # "" clears the owner
    due_day: Optional[int] = None  # 0 clears the due day


class PaidIn(BaseModel):
    category_id: str
    year: int
    month: int
    paid: bool


class GoalIn(BaseModel):
    name: str
    icon: str = "airplane"
    target: float


class DepositIn(BaseModel):
    year: int
    month: int
    amount: Optional[float] = None  # None removes the deposit of that month


class EntryIn(BaseModel):
    year: int
    month: int
    ref_type: Literal["member", "category"]
    ref_id: str
    value: Optional[float] = None  # None removes override/entry
    apply_all: bool = False  # set as default monthly value (members / fixed)


# ---------------------------------------------------------------- auth
async def get_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    # File downloads may not be able to attach headers on every platform.
    if not token and request.url.path.startswith("/api/export/"):
        token = request.query_params.get("token")
    if not token:
        raise HTTPException(401, "Não autenticado")

    async with httpx.AsyncClient(timeout=20) as hc:
        response = await hc.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {token}",
            },
        )
    if response.status_code != 200:
        raise HTTPException(401, "Sessão inválida")

    auth_user = response.json()
    user_id = auth_user.get("id")
    email = auth_user.get("email")
    if not user_id or not email:
        raise HTTPException(401, "Usuário inválido")

    metadata = auth_user.get("user_metadata") or {}
    profile = await db.profiles.find_one({"user_id": user_id}, NOID)
    values = {
        "user_id": user_id,
        "email": email,
        "name": metadata.get("full_name") or metadata.get("name") or email.split("@", 1)[0],
        "picture": metadata.get("avatar_url") or metadata.get("picture"),
    }
    if profile:
        await db.profiles.update_one({"user_id": user_id}, {"$set": values})
        profile.update(values)
    else:
        await db.profiles.insert_one(values)
        profile = values
    memberships = await db.family_memberships.find({"user_id": user_id}, NOID).to_list(100)
    profile["memberships"] = memberships
    active_membership = next((m for m in memberships if m["family_id"] == profile.get("family_id")), None)
    if active_membership:
        profile["family_role"] = active_membership["role"]
    return profile


async def get_family_id(user: dict = Depends(get_user)) -> str:
    if not user.get("family_id"):
        raise HTTPException(400, "Você ainda não faz parte de uma família")
    return user["family_id"]


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_user)):
    user = dict(user)
    user["is_superadmin"] = await platform_superadmin_flag(user["user_id"])
    user.pop("created_at", None)
    return user


async def platform_superadmin_flag(user_id: str) -> bool:
    """Best-effort UI hint. Admin endpoints perform their own fail-closed check."""
    try:
        grant = await db.platform_superadmins.find_one({"user_id": user_id}, {"role": 1})
        return bool(grant and grant.get("role") == "superadmin")
    except Exception as exc:
        # The additive migration may not yet be installed in this environment.
        logger.warning("Platform-admin grant lookup unavailable (%s)", type(exc).__name__)
        return False


async def require_platform_superadmin(user: dict = Depends(get_user)) -> dict:
    """Authorize solely from the verified JWT subject and server-side grant."""
    try:
        grant = await db.platform_superadmins.find_one({"user_id": user["user_id"]}, {"role": 1})
    except Exception as exc:
        logger.error("Platform-admin authorization store unavailable (%s)", type(exc).__name__)
        raise HTTPException(503, "A área administrativa ainda não está configurada.")
    if not grant or grant.get("role") != "superadmin":
        raise HTTPException(403, "Acesso restrito ao Superadministrador da plataforma.")
    return user


async def record_platform_admin_audit(
    actor_user_id: str,
    action: str,
    *,
    target_family_id: str | None = None,
    details: dict | None = None,
) -> None:
    try:
        await db.platform_admin_audit.insert_one({
            "actor_user_id": actor_user_id,
            "action": action,
            "target_family_id": target_family_id,
            "details": details or {},
            "created_at": now(),
        })
    except Exception as exc:
        logger.error("Platform-admin audit write failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Não foi possível registrar a auditoria administrativa.")


@api_router.get("/platform-admin/overview")
async def platform_admin_overview(user: dict = Depends(require_platform_superadmin)):
    try:
        rows = await db.rpc("platform_admin_overview")
    except Exception as exc:
        logger.error("Platform-admin overview query failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Não foi possível consultar os indicadores administrativos.")
    if not rows:
        raise HTTPException(503, "Os indicadores administrativos ainda não estão disponíveis.")
    data = rows[0]
    await record_platform_admin_audit(
        user["user_id"], "platform.dashboard.viewed",
        details={"family_count": data.get("families_count", 0), "user_count": data.get("users_count", 0)},
    )
    return {"status": "available", **data}


@api_router.get("/platform-admin/families")
async def platform_admin_families(
    q: str | None = Query(default=None, max_length=80),
    page: int = Query(default=1, ge=1, le=100000),
    per_page: int = Query(default=25, ge=1, le=100),
    user: dict = Depends(require_platform_superadmin),
):
    query = (q or "").strip() or None
    try:
        items = await db.rpc("platform_admin_list_families", {
            "p_limit": per_page,
            "p_offset": (page - 1) * per_page,
            "p_query": query,
        })
    except Exception as exc:
        logger.error("Platform-admin family list query failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Não foi possível consultar as famílias.")
    # The RPC returns only administrative metadata; it never reads finance tables.
    await record_platform_admin_audit(
        user["user_id"], "platform.families.listed",
        details={"page": page, "per_page": per_page, "query_used": bool(query), "returned": len(items)},
    )
    return {"items": items, "page": page, "per_page": per_page, "has_more": len(items) == per_page}


@api_router.get("/platform-admin/audit")
async def platform_admin_audit(user: dict = Depends(require_platform_superadmin)):
    try:
        rows = await db.platform_admin_audit.find({}, {
            "audit_id": 1, "actor_user_id": 1, "action": 1,
            "target_family_id": 1, "details": 1, "created_at": 1,
        }).sort("created_at", -1).to_list(50)
    except Exception as exc:
        logger.error("Platform-admin audit read failed (%s)", type(exc).__name__)
        raise HTTPException(503, "Não foi possível consultar a auditoria.")
    await record_platform_admin_audit(user["user_id"], "platform.audit.viewed", details={"returned": len(rows)})
    return {"items": rows}


@api_router.post("/auth/access")
async def record_foreground_access(user: dict = Depends(get_user)):
    """Record a deliberate app foreground event, never background refresh traffic."""
    family_id = user.get("family_id")
    if not family_id:
        return {"ok": True}
    await db.family_memberships.update_one(
        {"family_id": family_id, "user_id": user["user_id"]},
        {"$set": {"last_access_at": now()}},
    )
    return {"ok": True}


@api_router.post("/auth/logout")
async def auth_logout(request: Request):
    # Supabase Auth owns token revocation and the client signs out there.
    return {"ok": True}


# ---------------------------------------------------------------- family
def make_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no O/0/I/1
    return "".join(random.choice(alphabet) for _ in range(6))


CARD_PREFIX = "Cartão de crédito – "


async def seed_family(family_id: str, owner_name: str, owner_user_id: str | None = None):
    # A newly created family starts with one real person: its authenticated owner.
    # Other people are added only when the owner chooses to add them.
    owner_member = {
        "member_id": new_id("mem"),
        "family_id": family_id,
        "name": owner_name.strip() or "Responsável",
        "color": "#3B825C",
        "default_income": 0.0,
        "linked_user_id": owner_user_id,
        "order": 0,
        "created_at": now(),
    }
    members = [owner_member]
    await db.members.insert_many(members)
    await db.categories.insert_many([
        {"category_id": new_id("cat"), "family_id": family_id, "kind": k, "name": n, "icon": ic,
         "default_value": 0.0, "order": i, "created_at": now(),
         "member_id": owner_member["member_id"] if n == "Cartão de crédito" else None}
        for i, (k, n, ic) in enumerate(SEED_CATEGORIES)
    ])


async def link_card_owners():
    """Existing families: link 'Cartão de crédito – X' categories to member X."""
    async for c in db.categories.find({"member_id": {"$exists": False}, "name": {"$regex": f"^{CARD_PREFIX}"}}):
        m = await db.members.find_one({"family_id": c["family_id"], "name": c["name"][len(CARD_PREFIX):]})
        await db.categories.update_one({"category_id": c["category_id"]}, {"$set": {"member_id": m["member_id"] if m else None}})


@api_router.post("/family")
async def create_family(body: FamilyCreate, user: dict = Depends(get_user)):
    if user.get("family_id") or user.get("memberships"):
        raise HTTPException(400, "Você já faz parte de uma família")
    code = make_code()
    while await db.families.find_one({"invite_code": code}):
        code = make_code()
    family_id = new_id("fam")
    await db.families.insert_one({"family_id": family_id, "name": body.name.strip() or "Minha Família",
                                  "invite_code": code, "owner_user_id": user["user_id"], "created_at": now()})
    await seed_family(family_id, user["name"], user["user_id"])
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"family_id": family_id, "family_role": "owner"}},
    )
    await db.family_memberships.insert_one({"family_id": family_id, "user_id": user["user_id"], "role": "owner", "joined_at": now(), "last_access_at": None})
    return await family_info(family_id, user["user_id"])


@api_router.post("/family/join")
async def join_family(body: FamilyJoin, user: dict = Depends(get_user)):
    fam = await db.families.find_one({"invite_code": body.code.strip().upper()}, NOID)
    if not fam:
        raise HTTPException(404, "Código não encontrado")
    if user.get("family_role") in {"owner", "admin"}:
        raise HTTPException(409, "Proprietários e administradores não podem entrar em outra família.")
    if any(m.get("role") in {"owner", "admin"} for m in user.get("memberships", [])):
        raise HTTPException(409, "Sua conta tem um perfil de proprietário ou administrador.")
    existing = await db.family_memberships.find_one({"family_id": fam["family_id"], "user_id": user["user_id"]})
    if not existing:
        await db.family_memberships.insert_one({"family_id": fam["family_id"], "user_id": user["user_id"], "role": "member", "joined_at": now(), "last_access_at": None})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": fam["family_id"], "family_role": "member"}})
    return await family_info(fam["family_id"], user["user_id"])


def _invite_error(invitation: dict | None) -> None:
    if not invitation:
        raise HTTPException(404, "Convite inválido.")
    if invitation.get("cancelled_at"):
        raise HTTPException(410, "Este convite foi cancelado.")
    if invitation.get("used_at"):
        raise HTTPException(410, "Este convite já foi utilizado.")
    expires_at = invitation.get("expires_at")
    if expires_at and datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) <= now():
        raise HTTPException(410, "Este convite expirou.")


async def require_family_manager(user: dict = Depends(get_user)) -> dict:
    if not user.get("family_id"):
        raise HTTPException(400, "Você ainda não faz parte de uma família.")
    membership = await db.family_memberships.find_one({"family_id": user["family_id"], "user_id": user["user_id"]})
    if not membership or membership.get("role") not in {"owner", "admin"}:
        raise HTTPException(403, "Somente o proprietário ou administradores podem convidar integrantes.")
    user["family_role"] = membership["role"]
    return user


@api_router.get("/family/invites/{token}")
async def preview_family_invite(token: str):
    if not token or len(token) > 256:
        raise HTTPException(404, "Convite inválido.")
    invitation = await db.family_invites.find_one({"token_hash": invite_token_hash(token)}, NOID)
    _invite_error(invitation)
    family = await db.families.find_one({"family_id": invitation["family_id"]}, {"_id": 0, "name": 1})
    if not family:
        raise HTTPException(404, "Convite inválido.")
    return {"family_name": family["name"], "expires_at": invitation["expires_at"], "valid": True}


@api_router.post("/family/invites")
async def create_family_invite(user: dict = Depends(require_family_manager)):
    for _ in range(3):
        raw_token = secrets.token_urlsafe(32)
        token_hash = invite_token_hash(raw_token)
        try:
            await db.family_invites.insert_one({
                "invite_id": new_id("inv"),
                "family_id": user["family_id"],
                "token_hash": token_hash,
                "created_by": user["user_id"],
                "created_at": now(),
                "expires_at": now() + timedelta(hours=24),
            })
            break
        except SupabaseDBError:
            if _ == 2:
                raise HTTPException(500, "Não foi possível gerar o convite agora.")
    else:
        raise HTTPException(500, "Não foi possível gerar o convite agora.")

    return {
        "invite_url": f"{CRM_PUBLIC_URL}/invite?token={quote(raw_token, safe='')}"
    }


@api_router.post("/family/invites/{token}/accept")
async def accept_family_invite(token: str, body: InviteAccept, user: dict = Depends(get_user)):
    if not token or len(token) > 256:
        raise HTTPException(404, "Convite inválido.")
    try:
        result = await db.rpc("accept_family_invite", {
            "p_token_hash": invite_token_hash(token),
            "p_user_id": user["user_id"],
            "p_display_name": body.display_name,
        })
    except SupabaseDBError as exc:
        detail = str(exc)
        codes = {
            "invite_invalid": (404, "Convite inválido."),
            "invite_cancelled": (410, "Este convite foi cancelado."),
            "invite_used": (410, "Este convite já foi utilizado."),
            "invite_expired": (410, "Este convite expirou."),
            "user_invalid": (401, "Não foi possível identificar sua conta."),
            "user_already_member": (409, "Você já participa desta família."),
            "user_already_family": (409, "Você já participa de outra família."),
            "user_elevated_cannot_join": (409, "Proprietários e administradores não podem aceitar convites para outra família."),
        }
        for code, (status, message) in codes.items():
            if code in detail:
                raise HTTPException(status, message)
        logger.exception("Family invite acceptance failed")
        raise HTTPException(500, "Não foi possível aceitar o convite agora.")

    family_id = result[0].get("family_id") if result else None
    if not family_id:
        raise HTTPException(500, "Não foi possível concluir o convite agora.")
    return await family_info(family_id, user["user_id"])


@api_router.post("/family/invites/{invite_id}/cancel")
async def cancel_family_invite(invite_id: str, user: dict = Depends(require_family_manager)):
    result = await db.family_invites.update_one(
        {"invite_id": invite_id, "family_id": user["family_id"], "used_at": None, "cancelled_at": None},
        {"$set": {"cancelled_at": now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Convite não encontrado ou já encerrado.")
    return {"ok": True}


async def family_info(family_id: str, viewer_user_id: str | None = None) -> dict:
    fam = await db.families.find_one(
        {"family_id": family_id},
        {"_id": 0, "created_at": 0, "invite_code": 0, "owner_user_id": 0},
    )
    memberships = await db.family_memberships.find({"family_id": family_id}, NOID).to_list(100)
    membership_by_user = {m["user_id"]: m for m in memberships}
    viewer_role = membership_by_user.get(viewer_user_id, {}).get("role")
    profiles = await db.users.find({"user_id": {"$in": list(membership_by_user)}}, NOID).to_list(100) if membership_by_user else []
    users = [{
        "user_id": p["user_id"], "name": p.get("name"), "email": p.get("email"),
        "picture": p.get("picture"), "family_role": membership_by_user[p["user_id"]]["role"],
        **({"last_access_at": membership_by_user[p["user_id"]].get("last_access_at")} if viewer_role in {"owner", "admin"} else {}),
    } for p in profiles]
    members = await db.members.find({"family_id": family_id}, {"_id": 0, "created_at": 0}).sort("order", 1).to_list(100)
    await attach_member_photos(members)
    return {**fam, "users": users, "members": members}


async def attach_member_photos(members: list[dict]) -> None:
    for member in members:
        if member.get("photo_path"):
            member["photo_url"] = await db.create_signed_url("family-member-photos", member["photo_path"], 3600)
        member.pop("photo_path", None)


@api_router.get("/families/mine")
async def my_families(user: dict = Depends(get_user)):
    memberships = await db.family_memberships.find({"user_id": user["user_id"]}, NOID).to_list(100)
    family_ids = [m["family_id"] for m in memberships]
    families = await db.families.find({"family_id": {"$in": family_ids}}, NOID).to_list(100) if family_ids else []
    by_id = {f["family_id"]: f for f in families}
    return [{"family_id": m["family_id"], "name": by_id[m["family_id"]]["name"], "role": m["role"],
             "active": m["family_id"] == user.get("family_id")} for m in memberships if m["family_id"] in by_id]


@api_router.post("/family/switch/{family_id}")
async def switch_family(family_id: str, user: dict = Depends(get_user)):
    membership = await db.family_memberships.find_one({"family_id": family_id, "user_id": user["user_id"]})
    if not membership:
        raise HTTPException(403, "Sua conta não está vinculada a essa família.")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": family_id, "family_role": membership["role"]}})
    return await family_info(family_id, user["user_id"])


class FamilyRoleIn(BaseModel):
    role: Literal["admin", "member"]


@api_router.put("/family/users/{target_user_id}/role")
async def update_family_role(target_user_id: str, body: FamilyRoleIn, user: dict = Depends(get_user)):
    if not user.get("family_id"):
        raise HTTPException(400, "Você ainda não faz parte de uma família.")
    try:
        await db.rpc("set_family_member_role", {
            "p_family_id": user["family_id"], "p_actor_user_id": user["user_id"],
            "p_target_user_id": target_user_id, "p_role": body.role,
        })
    except SupabaseDBError as exc:
        detail = str(exc)
        if "role_owner_required" in detail:
            raise HTTPException(403, "Somente o proprietário pode alterar perfis.")
        if "target_not_member" in detail:
            raise HTTPException(404, "Integrante não encontrado.")
        if "owner_role_immutable" in detail:
            raise HTTPException(409, "O perfil do proprietário não pode ser alterado.")
        if "multi_family_admin_forbidden" in detail:
            raise HTTPException(409, "Este integrante participa de mais de uma família. Encerre os outros vínculos antes de promover a administrador.")
        if "role_invalid" in detail:
            raise HTTPException(400, "Perfil inválido.")
        raise HTTPException(500, "Não foi possível atualizar o perfil agora.")
    return await family_info(user["family_id"], user["user_id"])


@api_router.get("/family")
async def get_family(family_id: str = Depends(get_family_id), user: dict = Depends(get_user)):
    return await family_info(family_id, user["user_id"])


@api_router.post("/family/leave")
async def leave_family(user: dict = Depends(get_user)):
    if not user.get("family_id"):
        return {"ok": True}
    membership = await db.family_memberships.find_one({"family_id": user["family_id"], "user_id": user["user_id"]})
    if membership and membership.get("role") == "owner":
        raise HTTPException(409, "O proprietário não pode sair da família. Transfira a propriedade antes.")
    await db.family_memberships.delete_one({"family_id": user["family_id"], "user_id": user["user_id"]})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"family_id": None, "family_role": "member"}})
    return {"ok": True}


# ---------------------------------------------------------------- members
@api_router.post("/members")
async def add_member(body: MemberIn, family_id: str = Depends(get_family_id)):
    count = await db.members.count_documents({"family_id": family_id})
    doc = {"member_id": new_id("mem"), "family_id": family_id, "name": body.name.strip(), "color": body.color,
           "default_income": max(body.default_income, 0), "order": count, "created_at": now()}
    await db.members.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("created_at", None)
    return doc


@api_router.put("/members/{member_id}")
async def update_member(member_id: str, body: MemberIn, family_id: str = Depends(get_family_id)):
    res = await db.members.update_one({"member_id": member_id, "family_id": family_id},
                                      {"$set": {"name": body.name.strip(), "color": body.color,
                                                "default_income": max(body.default_income, 0)}})
    if res.matched_count == 0:
        raise HTTPException(404, "Membro não encontrado")
    updated = await db.members.find_one({"member_id": member_id, "family_id": family_id}, {"_id": 0, "created_at": 0})
    if updated.get("photo_path"):
        updated["photo_url"] = await db.create_signed_url("family-member-photos", updated["photo_path"], 3600)
    updated.pop("photo_path", None)
    return updated


@api_router.delete("/members/{member_id}")
async def delete_member(member_id: str, family_id: str = Depends(get_family_id)):
    await db.members.delete_one({"member_id": member_id, "family_id": family_id})
    await db.entries.delete_many({"family_id": family_id, "ref_id": member_id})
    await db.categories.update_many({"family_id": family_id, "member_id": member_id}, {"$set": {"member_id": None}})
    return {"ok": True}


@api_router.post("/members/{member_id}/link-self")
async def link_member_to_self(member_id: str, user: dict = Depends(get_user)):
    family_id = user.get("family_id")
    if not family_id or not await db.family_memberships.find_one({"family_id": family_id, "user_id": user["user_id"]}):
        raise HTTPException(403, "Sua conta não tem acesso a esta família.")
    member = await db.members.find_one({"member_id": member_id, "family_id": family_id})
    if not member:
        raise HTTPException(404, "Pessoa do orçamento não encontrada.")
    if member.get("linked_user_id") and member["linked_user_id"] != user["user_id"]:
        raise HTTPException(409, "Esta pessoa já está vinculada a outra conta.")
    existing = await db.members.find_one({"family_id": family_id, "linked_user_id": user["user_id"]})
    if existing and existing["member_id"] != member_id:
        raise HTTPException(409, "Sua conta já está vinculada a outra pessoa do orçamento.")
    await db.members.update_one({"member_id": member_id, "family_id": family_id}, {"$set": {"linked_user_id": user["user_id"]}})
    return {"ok": True}


PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
PHOTO_MAX_BYTES = 5 * 1024 * 1024


def _validate_image_signature(content_type: str, content: bytes) -> bool:
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


async def require_member_photo_manager(member_id: str, user: dict) -> tuple[str, dict]:
    family_id = user.get("family_id")
    membership = await db.family_memberships.find_one({"family_id": family_id, "user_id": user["user_id"]}) if family_id else None
    if not membership or membership.get("role") not in {"owner", "admin"}:
        raise HTTPException(403, "Somente o proprietário ou administrador pode alterar fotografias.")
    member = await db.members.find_one({"member_id": member_id, "family_id": family_id})
    if not member:
        raise HTTPException(404, "Pessoa do orçamento não encontrada.")
    return family_id, member


@api_router.post("/members/{member_id}/photo")
async def upload_member_photo(member_id: str, request: Request, user: dict = Depends(get_user)):
    family_id, member = await require_member_photo_manager(member_id, user)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower().strip()
    if content_type not in PHOTO_TYPES:
        raise HTTPException(415, "Use uma imagem JPG, PNG ou WebP.")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > PHOTO_MAX_BYTES:
                raise HTTPException(413, "A imagem deve ter no máximo 5 MB.")
        except ValueError:
            raise HTTPException(400, "Tamanho de imagem inválido.")
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > PHOTO_MAX_BYTES:
            raise HTTPException(413, "A imagem deve ter até 5 MB.")
    content = bytes(content)
    if not content:
        raise HTTPException(400, "Selecione uma fotografia.")
    if not _validate_image_signature(content_type, content):
        raise HTTPException(415, "O arquivo não corresponde a uma imagem válida.")
    path = f"{family_id}/{member_id}/{uuid.uuid4().hex}.{PHOTO_TYPES[content_type]}"
    try:
        await db.upload_private_object("family-member-photos", path, content, content_type)
        await db.members.update_one({"member_id": member_id, "family_id": family_id}, {"$set": {"photo_path": path}})
        old_path = member.get("photo_path")
        if old_path:
            await db.delete_private_object("family-member-photos", old_path)
        photo_url = await db.create_signed_url("family-member-photos", path, 3600)
    except SupabaseDBError:
        logger.exception("Member photo storage operation failed")
        raise HTTPException(502, "Não foi possível salvar a fotografia agora.")
    return {"photo_url": photo_url}


@api_router.delete("/members/{member_id}/photo")
async def remove_member_photo(member_id: str, user: dict = Depends(get_user)):
    family_id, member = await require_member_photo_manager(member_id, user)
    path = member.get("photo_path")
    if path:
        try:
            await db.delete_private_object("family-member-photos", path)
        except SupabaseDBError:
            logger.exception("Member photo removal failed")
            raise HTTPException(502, "Não foi possível remover a fotografia agora.")
    await db.members.update_one({"member_id": member_id, "family_id": family_id}, {"$set": {"photo_path": None}})
    return {"ok": True}


# ---------------------------------------------------------------- categories
@api_router.get("/categories")
async def list_categories(family_id: str = Depends(get_family_id)):
    return await db.categories.find({"family_id": family_id}, {"_id": 0, "created_at": 0}).sort("order", 1).to_list(500)


@api_router.post("/categories")
async def add_category(body: CategoryIn, family_id: str = Depends(get_family_id)):
    last = await db.categories.find({"family_id": family_id}).sort("order", -1).to_list(1)
    doc = {"category_id": new_id("cat"), "family_id": family_id, "kind": body.kind, "name": body.name.strip(),
           "icon": body.icon, "default_value": max(body.default_value, 0) if body.kind == "fixed" else 0.0,
           "member_id": body.member_id or None,
           "due_day": body.due_day if body.due_day and 1 <= body.due_day <= 31 else None,
           "order": (last[0]["order"] + 1) if last else 0, "created_at": now()}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("created_at", None)
    return doc


@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, body: CategoryUpdate, family_id: str = Depends(get_family_id)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "member_id" in upd:
        upd["member_id"] = upd["member_id"] or None
    if "due_day" in upd:
        upd["due_day"] = upd["due_day"] if 1 <= upd["due_day"] <= 31 else None
    if upd:
        res = await db.categories.update_one({"category_id": category_id, "family_id": family_id}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Conta não encontrada")
    return await db.categories.find_one({"category_id": category_id}, {"_id": 0, "created_at": 0})


@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, family_id: str = Depends(get_family_id)):
    await db.categories.delete_one({"category_id": category_id, "family_id": family_id})
    await db.entries.delete_many({"family_id": family_id, "ref_id": category_id})
    await db.bill_payments.delete_many({"family_id": family_id, "category_id": category_id})
    return {"ok": True}


# ---------------------------------------------------------------- bills due
@api_router.get("/bills/upcoming")
async def upcoming_bills(date: str, days: int = 7, family_id: str = Depends(get_family_id)):
    """Bills due between `date` (client's today, YYYY-MM-DD) and date+days, plus unpaid overdue bills of this month."""
    import calendar
    try:
        today = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Data inválida")
    cats = await db.categories.find({"family_id": family_id, "due_day": {"$gte": 1}}, NOID).to_list(500)
    end = today + timedelta(days=max(0, min(days, 31)))
    months = sorted({(today.year, today.month), (end.year, end.month)})
    paid = {(p["category_id"], p["year"], p["month"]) for p in await db.bill_payments.find(
        {"family_id": family_id, "$or": [{"year": y, "month": m} for y, m in months]}, NOID).to_list(1000)}
    bills = []
    for y, m in months:
        members, all_cats, emap = await load(family_id, y)
        r = compute_month(m, members, all_cats, emap)
        values = {row["id"]: row["value"] for row in r["sections"]["fixed"] + r["sections"]["variable"] + r["sections"]["income"]}
        last = calendar.monthrange(y, m)[1]
        for c in cats:
            due = today.replace(year=y, month=m, day=min(c["due_day"], last))
            is_paid = (c["category_id"], y, m) in paid
            if due > end or (due < today and (is_paid or (y, m) != (today.year, today.month))):
                continue
            bills.append({"category_id": c["category_id"], "name": c["name"], "icon": c["icon"], "kind": c["kind"],
                          "year": y, "month": m, "due_date": due.isoformat(), "days_left": (due - today).days,
                          "value": values.get(c["category_id"], 0.0), "paid": is_paid})
    bills.sort(key=lambda b: (b["paid"], b["due_date"]))
    return {"has_due_days": bool(cats), "bills": bills}


@api_router.put("/bills/paid")
async def set_bill_paid(body: PaidIn, family_id: str = Depends(get_family_id)):
    if not await db.categories.find_one({"category_id": body.category_id, "family_id": family_id}):
        raise HTTPException(404, "Conta não encontrada")
    key = {"family_id": family_id, "category_id": body.category_id, "year": body.year, "month": body.month}
    if body.paid:
        await db.bill_payments.update_one(key, {"$set": {"paid_at": now()}}, upsert=True)
    else:
        await db.bill_payments.delete_one(key)
    return {"ok": True}


# ---------------------------------------------------------------- entries / calc
@api_router.put("/entries")
async def set_entry(body: EntryIn, family_id: str = Depends(get_family_id)):
    if not 1 <= body.month <= 12:
        raise HTTPException(400, "Mês inválido")
    if body.apply_all:
        value = max(body.value or 0, 0)
        if body.ref_type == "member":
            res = await db.members.update_one({"member_id": body.ref_id, "family_id": family_id}, {"$set": {"default_income": value}})
        else:
            res = await db.categories.update_one({"category_id": body.ref_id, "family_id": family_id, "kind": "fixed"},
                                                 {"$set": {"default_value": value}})
        if res.matched_count == 0:
            raise HTTPException(400, "Não é possível aplicar a todos os meses")
        # remove overrides from this month onward so the new monthly value applies
        await db.entries.delete_many({"family_id": family_id, "ref_id": body.ref_id,
                                      "$or": [{"year": {"$gt": body.year}},
                                              {"year": body.year, "month": {"$gte": body.month}}]})
        return {"ok": True}
    key = {"family_id": family_id, "year": body.year, "month": body.month, "ref_id": body.ref_id}
    if body.value is None:
        await db.entries.delete_one(key)
    else:
        await db.entries.update_one(key, {"$set": {"value": max(body.value, 0), "ref_type": body.ref_type,
                                                   "updated_at": now()}}, upsert=True)
    return {"ok": True}


async def load(family_id: str, year: int):
    members = await db.members.find({"family_id": family_id}, {"_id": 0, "created_at": 0}).sort("order", 1).to_list(100)
    cats = await db.categories.find({"family_id": family_id}, {"_id": 0, "created_at": 0}).sort("order", 1).to_list(500)
    entries = await db.entries.find({"family_id": family_id, "year": year}, NOID).to_list(10000)
    emap = {(e["month"], e["ref_id"]): e["value"] for e in entries}
    return members, cats, emap


def compute_month(month: int, members, cats, emap) -> dict:
    income, fixed, variable = [], [], []
    for m in members:
        ov = emap.get((month, m["member_id"]))
        income.append({"ref_type": "member", "id": m["member_id"], "name": m["name"], "icon": "account",
                       "color": m.get("color"), "photo_url": m.get("photo_url"), "kind": "member", "default_value": m["default_income"],
                       "value": ov if ov is not None else m["default_income"], "overridden": ov is not None})
    for c in cats:
        ov = emap.get((month, c["category_id"]))
        if c["kind"] == "fixed":
            val, default = (ov if ov is not None else c["default_value"]), c["default_value"]
        else:
            val, default = (ov or 0.0), 0.0
        row = {"ref_type": "category", "id": c["category_id"], "name": c["name"], "icon": c["icon"],
               "color": None, "kind": c["kind"], "default_value": default, "value": val, "overridden": ov is not None,
               "member_id": c.get("member_id"), "due_day": c.get("due_day")}
        {"income_extra": income, "fixed": fixed, "variable": variable}[c["kind"]].append(row)
    ti = sum(r["value"] for r in income)
    tf = sum(r["value"] for r in fixed)
    tv = sum(r["value"] for r in variable)
    te = tf + tv
    status = "" if ti == 0 and te == 0 else ("POSITIVO" if ti - te >= 0 else "NEGATIVO")
    return {"month": month, "sections": {"income": income, "fixed": fixed, "variable": variable},
            "totals": {"income": ti, "fixed": tf, "variable": tv, "expenses": te, "balance": ti - te,
                       "pct": (te / ti) if ti else None, "status": status}}


@api_router.get("/month/{year}/{month}")
async def get_month(year: int, month: int, family_id: str = Depends(get_family_id)):
    if not 1 <= month <= 12:
        raise HTTPException(400, "Mês inválido")
    members, cats, emap = await load(family_id, year)
    await attach_member_photos(members)
    return {"year": year, **compute_month(month, members, cats, emap)}


@api_router.get("/year/{year}")
async def get_year(year: int, family_id: str = Depends(get_family_id)):
    members, cats, emap = await load(family_id, year)
    months, agg = [], {}
    ti = te = 0.0
    for m in range(1, 13):
        r = compute_month(m, members, cats, emap)
        t = r["totals"]
        ti += t["income"]
        te += t["expenses"]
        months.append({"month": m, "income": t["income"], "expenses": t["expenses"], "fixed": t["fixed"],
                       "variable": t["variable"], "balance": t["balance"], "status": t["status"]})
        for row in r["sections"]["fixed"] + r["sections"]["variable"]:
            a = agg.setdefault(row["id"], {"id": row["id"], "name": row["name"], "icon": row["icon"],
                                           "kind": row["kind"], "value": 0.0})
            a["value"] += row["value"]
    breakdown = sorted([a for a in agg.values() if a["value"] > 0], key=lambda a: -a["value"])
    for a in breakdown:
        a["pct"] = a["value"] / te if te else 0
    return {"year": year, "months": months,
            "totals": {"income": ti, "expenses": te, "balance": ti - te, "pct": (te / ti) if ti else None},
            "breakdown": breakdown}


@api_router.post("/month/{year}/{month}/copy-previous")
async def copy_previous(year: int, month: int, family_id: str = Depends(get_family_id)):
    """Copy last month's expenses (variable values + fixed month-only values) into empty items of this month."""
    if not 1 <= month <= 12:
        raise HTTPException(400, "Mês inválido")
    py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
    cats = await db.categories.find({"family_id": family_id, "kind": {"$in": ["variable", "fixed"]}}, NOID).to_list(500)
    cat_ids = [c["category_id"] for c in cats]
    prev = await db.entries.find({"family_id": family_id, "year": py, "month": pm, "ref_id": {"$in": cat_ids}}, NOID).to_list(1000)
    current = {e["ref_id"] for e in await db.entries.find(
        {"family_id": family_id, "year": year, "month": month}, NOID).to_list(1000)}
    copied = 0
    for e in prev:
        if e["ref_id"] in current or not e.get("value"):
            continue
        await db.entries.insert_one({"family_id": family_id, "year": year, "month": month, "ref_id": e["ref_id"],
                                     "ref_type": "category", "value": e["value"], "updated_at": now()})
        copied += 1
    return {"copied": copied}


# ---------------------------------------------------------------- spending per person
@api_router.get("/people/{year}")
async def people_year(year: int, family_id: str = Depends(get_family_id)):
    members, cats, emap = await load(family_id, year)
    await attach_member_photos(members)
    out = []
    for m in members:
        own = [c for c in cats if c.get("member_id") == m["member_id"] and c["kind"] in ("variable", "fixed")]
        months = []
        for mo in range(1, 13):
            total = 0.0
            for c in own:
                ov = emap.get((mo, c["category_id"]))
                total += (ov if ov is not None else c["default_value"]) if c["kind"] == "fixed" else (ov or 0.0)
            months.append(total)
        out.append({"member_id": m["member_id"], "name": m["name"], "color": m.get("color"), "photo_url": m.get("photo_url"),
                    "categories": [{"id": c["category_id"], "name": c["name"], "icon": c["icon"]} for c in own],
                    "months": months, "total": sum(months)})
    return {"year": year, "members": out}


# ---------------------------------------------------------------- savings goals
async def goal_out(g: dict) -> dict:
    deps = await db.goal_deposits.find({"goal_id": g["goal_id"]}, NOID).sort([("year", 1), ("month", 1)]).to_list(1000)
    saved = sum(d["amount"] for d in deps)
    return {"goal_id": g["goal_id"], "name": g["name"], "icon": g["icon"], "target": g["target"], "saved": saved,
            "pct": (saved / g["target"]) if g["target"] else 0,
            "deposits": [{"year": d["year"], "month": d["month"], "amount": d["amount"]} for d in deps]}


@api_router.get("/goals")
async def list_goals(family_id: str = Depends(get_family_id)):
    goals = await db.goals.find({"family_id": family_id}, NOID).sort("created_at", 1).to_list(100)
    return [await goal_out(g) for g in goals]


@api_router.post("/goals")
async def add_goal(body: GoalIn, family_id: str = Depends(get_family_id)):
    if not body.name.strip() or body.target <= 0:
        raise HTTPException(400, "Digite o nome e o valor da meta")
    g = {"goal_id": new_id("goal"), "family_id": family_id, "name": body.name.strip(), "icon": body.icon,
         "target": body.target, "created_at": now()}
    await db.goals.insert_one(g)
    return await goal_out(g)


@api_router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalIn, family_id: str = Depends(get_family_id)):
    if not body.name.strip() or body.target <= 0:
        raise HTTPException(400, "Digite o nome e o valor da meta")
    res = await db.goals.update_one({"goal_id": goal_id, "family_id": family_id},
                                    {"$set": {"name": body.name.strip(), "icon": body.icon, "target": body.target}})
    if res.matched_count == 0:
        raise HTTPException(404, "Meta não encontrada")
    return await goal_out(await db.goals.find_one({"goal_id": goal_id}, NOID))


@api_router.delete("/goals/{goal_id}")
async def delete_goal(goal_id: str, family_id: str = Depends(get_family_id)):
    await db.goals.delete_one({"goal_id": goal_id, "family_id": family_id})
    await db.goal_deposits.delete_many({"goal_id": goal_id})
    return {"ok": True}


@api_router.put("/goals/{goal_id}/deposit")
async def set_deposit(goal_id: str, body: DepositIn, family_id: str = Depends(get_family_id)):
    g = await db.goals.find_one({"goal_id": goal_id, "family_id": family_id}, NOID)
    if not g:
        raise HTTPException(404, "Meta não encontrada")
    if not 1 <= body.month <= 12:
        raise HTTPException(400, "Mês inválido")
    key = {"goal_id": goal_id, "year": body.year, "month": body.month}
    if not body.amount:
        await db.goal_deposits.delete_one(key)
    else:
        await db.goal_deposits.update_one(key, {"$set": {"amount": max(body.amount, 0)}}, upsert=True)
    return await goal_out(g)


# ---------------------------------------------------------------- export
MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


async def year_table(family_id: str, year: int):
    members, cats, emap = await load(family_id, year)
    data = [compute_month(m, members, cats, emap) for m in range(1, 13)]
    blocks = []
    for key, title, total_title in [("income", "RENDA", "TOTAL RENDA"), ("fixed", "DESPESAS FIXAS", "TOTAL FIXAS"),
                                    ("variable", "DESPESAS VARIÁVEIS", "TOTAL VARIÁVEIS")]:
        rows = [(r["name"], [d["sections"][key][i]["value"] for d in data]) for i, r in enumerate(data[0]["sections"][key])]
        totals = [sum(d["sections"][key][i]["value"] for i in range(len(d["sections"][key]))) for d in data]
        blocks.append((title, rows, total_title, totals))
    summary = [
        ("TOTAL DESPESAS", [d["totals"]["expenses"] for d in data]),
        ("SALDO DO MÊS", [d["totals"]["balance"] for d in data]),
    ]
    status = [d["totals"]["status"] for d in data]
    pct = [d["totals"]["pct"] for d in data]
    return blocks, summary, status, pct


def money(v: float) -> str:
    s = f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{'-' if v < 0 else ''}R$ {s}"


@api_router.get("/export/{year}.xlsx")
async def export_xlsx(year: int, family_id: str = Depends(get_family_id)):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from fastapi.responses import StreamingResponse

    fam = await db.families.find_one({"family_id": family_id}, NOID)
    blocks, summary, status, pct = await year_table(family_id, year)
    wb = Workbook()
    ws = wb.active
    ws.title = "Lançamentos"
    head_fill = PatternFill("solid", fgColor="3B825C")
    total_fill = PatternFill("solid", fgColor="D1E5D7")
    bold, white = Font(bold=True), Font(bold=True, color="FFFFFF")
    fmt = '"R$" #,##0.00'
    ws.append([f"ORÇAMENTO DA FAMÍLIA – {fam['name']} – {year}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    for title, rows, total_title, totals in blocks:
        ws.append([title, *MONTHS_SHORT, "Total ano"])
        for c in ws[ws.max_row]:
            c.fill, c.font = head_fill, white
        for name, vals in rows:
            ws.append([name, *vals, sum(vals)])
        ws.append([total_title, *totals, sum(totals)])
        for c in ws[ws.max_row]:
            c.fill, c.font = total_fill, bold
        ws.append([])
    for name, vals in summary:
        ws.append([name, *vals, sum(vals)])
        for c in ws[ws.max_row]:
            c.font = bold
    ws.append(["SITUAÇÃO", *status])
    ws.append(["% da renda gasta", *[p if p is not None else "" for p in pct]])
    for row in ws.iter_rows(min_row=3):
        for c in row[1:]:
            if isinstance(c.value, (int, float)):
                c.number_format = "0%" if row[0].value == "% da renda gasta" else fmt
            c.alignment = Alignment(horizontal="right")
    ws.column_dimensions["A"].width = 34
    for col in "BCDEFGHIJKLMN":
        ws.column_dimensions[col].width = 13

    goals = await db.goals.find({"family_id": family_id}, NOID).to_list(100)
    if goals:
        wg = wb.create_sheet("Metas")
        wg.append(["Meta", "Valor da meta", "Guardado", "% atingido"])
        for c in wg[1]:
            c.fill, c.font = head_fill, white
        for g in goals:
            o = await goal_out(g)
            wg.append([o["name"], o["target"], o["saved"], o["pct"]])
            wg.cell(wg.max_row, 2).number_format = fmt
            wg.cell(wg.max_row, 3).number_format = fmt
            wg.cell(wg.max_row, 4).number_format = "0%"
        wg.column_dimensions["A"].width = 30

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="orcamento_familia_{year}.xlsx"'})


@api_router.get("/export/{year}/html")
async def export_html(year: int, family_id: str = Depends(get_family_id)):
    from html import escape
    fam = await db.families.find_one({"family_id": family_id}, NOID)
    blocks, summary, status, pct = await year_table(family_id, year)

    def cells(vals, total=True):
        tds = "".join(f"<td>{money(v) if v else '–'}</td>" for v in vals)
        return tds + (f"<td><b>{money(sum(vals))}</b></td>" if total else "")

    head = "<tr><th></th>" + "".join(f"<th>{m}</th>" for m in MONTHS_SHORT) + "<th>Total</th></tr>"
    body = ""
    for title, rows, total_title, totals in blocks:
        body += f"<tr class='sec'><td colspan='14'>{title}</td></tr>"
        body += "".join(f"<tr><td>{escape(n)}</td>{cells(v)}</tr>" for n, v in rows)
        body += f"<tr class='tot'><td>{total_title}</td>{cells(totals)}</tr>"
    for n, v in summary:
        body += f"<tr class='tot'><td>{n}</td>{cells(v)}</tr>"
    body += "<tr><td>SITUAÇÃO</td>" + "".join(
        f"<td class='{'pos' if s == 'POSITIVO' else 'neg' if s else ''}'>{s or '–'}</td>" for s in status) + "<td></td></tr>"
    body += "<tr><td>% da renda gasta</td>" + "".join(
        f"<td>{round(p * 100)}%</td>" if p is not None else "<td>–</td>" for p in pct) + "<td></td></tr>"
    html = f"""<html><head><meta charset='utf-8'><style>
    @page {{ size: A4 landscape; margin: 12mm; }}
    body {{ font-family: Helvetica, Arial, sans-serif; color: #1A1A19; }}
    h1 {{ color: #3B825C; font-size: 20px; margin: 0 0 8px; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 8.5px; }}
    th {{ background: #3B825C; color: #fff; padding: 4px; }}
    td {{ border-bottom: 1px solid #E3E2DD; padding: 3px 4px; text-align: right; white-space: nowrap; }}
    td:first-child {{ text-align: left; }}
    tr.sec td {{ background: #E8F3EB; font-weight: bold; text-align: left; }}
    tr.tot td {{ font-weight: bold; background: #F0EFEB; }}
    .pos {{ color: #2E7D32; font-weight: bold; }} .neg {{ color: #D32F2F; font-weight: bold; }}
    </style></head><body><h1>Orçamento da Família – {escape(fam['name'])} – {year}</h1>
    <table>{head}{body}</table></body></html>"""
    return {"html": html}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("startup")
async def startup():
    await link_card_owners()


@app.on_event("shutdown")
async def shutdown_db_client():
    await db.close()
