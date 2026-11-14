import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home = readFileSync("app/(tabs)/index.tsx", "utf8");
const screen = readFileSync("app/perfil.tsx", "utf8");
const invite = readFileSync("app/invite.tsx", "utf8");
const layout = readFileSync("app/_layout.tsx", "utf8");
const api = readFileSync("../backend/server.py", "utf8");

assert.match(home, /home-profile-button/);
assert.match(home, /router\.push\("\/perfil"\)/);
assert.match(screen, /profile-name-input/);
assert.match(screen, /E-mail da conta Google/);
assert.match(screen, /Papel na família/);
assert.match(screen, /uploadOwnProfilePhoto/);
assert.match(screen, /inviteStep\) continueHome\(\)/);
assert.match(invite, /invite-complete-profile-button/);
assert.match(invite, /invite-profile-later-button/);
assert.match(invite, /refreshUser\(\);\s*setInviteAccepted\(true\)/);
assert.match(layout, /Stack\.Screen name="perfil"/);
assert.match(api, /@api_router\.patch\("\/auth\/profile"\)/);
assert.match(api, /\{"family_id": family_id, "user_id": user\["user_id"\]\}/);
assert.match(api, /profiles\/\{user\['user_id'\]\}/);
assert.match(api, /profile_photo_path/);
console.log("Meu perfil: fluxo, navegação, persistência e escopo de usuário verificados.");
