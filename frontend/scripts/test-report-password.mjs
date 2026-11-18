import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../src/api.ts", import.meta.url), "utf8");
const annual = await readFile(new URL("../app/(tabs)/ano.tsx", import.meta.url), "utf8");
const reset = await readFile(new URL("../app/report-password-reset.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../src/auth.tsx", import.meta.url), "utf8");

assert.match(api, /path === "\/reports\/password\/verify" && status === 401 && detail === "Senha de relatórios incorreta\."/);
assert.match(api, /res\.status === 401 && !isReportPasswordRejection\(path, res\.status, data\?\.detail\)/);
assert.match(api, /onUnauthorized\?\.\(\)/);
assert.equal((annual.match(/testID="report-password-input"/g) ?? []).length, 1);
assert.equal((annual.match(/testID="report-password-submit"/g) ?? []).length, 1);
assert.equal((annual.match(/testID="report-password-recovery"/g) ?? []).length, 1);
assert.match(annual, /setGateError\(null\)/);
assert.match(annual, /confira sua caixa de entrada e spam/);
assert.match(annual, /aguarde antes de tentar novamente/);
assert.equal((reset.match(/testID="report-reset-password"/g) ?? []).length, 1);
assert.equal((reset.match(/testID="report-reset-submit"/g) ?? []).length, 1);
assert.match(reset, /Esta senha protege a aba Ano e é diferente da senha da sua conta\./);
assert.doesNotMatch(reset, /supabase\.auth\.updateUser/);
assert.match(auth, /"USER_UPDATED"/);

console.log("Report-password rejection preserves Google session; recovery UI, retry state, and separate password flow checks passed.");
