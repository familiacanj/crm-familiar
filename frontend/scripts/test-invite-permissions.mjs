import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const invite = source("../app/invite.tsx");
const family = source("../app/(tabs)/familia.tsx");
const memberForm = source("../app/membro.tsx");
const categoryForm = source("../app/categoria.tsx");
const editEntry = source("../app/editar.tsx");
const launch = source("../app/(tabs)/lancar.tsx");

assert.match(invite, /setDisplayName\(user\.name\?\.trim\(\) \?\? ""\)/);
assert.match(invite, /disabled={!displayName\.trim\(\)}/);
assert.match(invite, /body: \{ display_name: chosenName \}/);
assert.match(family, /const canManageFamily = user\?\.family_role === "owner" \|\| user\?\.family_role === "admin"/);
assert.match(family, /canManageFamily \? <BigButton testID="add-member-button"/);
assert.doesNotMatch(family, /link-self-\$\{m\.member_id\}|linkToSelf/);
assert.match(memberForm, /testID="membro-management-denied"/);
assert.match(categoryForm, /testID="categoria-management-denied"/);
assert.match(editEntry, /p\.refType === "category" && canManageFamily/);
assert.match(editEntry, /p\.refType === "member" && canManageFamily/);
assert.match(launch, /ListFooterComponent=\{\s*canManageFamily \?/);

console.log("Invite display-name and family-management UI checks passed.");
