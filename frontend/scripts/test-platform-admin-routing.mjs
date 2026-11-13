import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/platform-admin-routing.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getPlatformAdminInitialRoute } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

assert.equal(getPlatformAdminInitialRoute(null), "/login");
assert.equal(getPlatformAdminInitialRoute({ family_id: null, is_superadmin: false }), "/onboarding");
assert.equal(getPlatformAdminInitialRoute({ family_id: "fam-1", is_superadmin: false }), "/(tabs)");
assert.equal(getPlatformAdminInitialRoute({ family_id: null, is_superadmin: true }), "/platform-admin");
assert.equal(getPlatformAdminInitialRoute({ family_id: "fam-1", is_superadmin: true }), "/platform-admin");

const layout = await readFile(new URL("../app/_layout.tsx", import.meta.url), "utf8");
assert.match(layout, /Stack\.Protected guard=\{!!user\?\.is_superadmin\}/);
const adminScreen = await readFile(new URL("../app/platform-admin.tsx", import.meta.url), "utf8");
assert.match(adminScreen, /\/platform-admin\/overview/);
assert.match(adminScreen, /\/platform-admin\/families/);
assert.match(adminScreen, /\/platform-admin\/audit/);
assert.match(adminScreen, /Solicitações de suporte/);
assert.match(adminScreen, /O envio e a publicação de comunicados não estão habilitados/);

console.log("platform admin routing and UI guards: 11 assertions passed");
