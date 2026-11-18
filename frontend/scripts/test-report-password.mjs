import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const api = await readFile(new URL("../src/api.ts", import.meta.url), "utf8");
const annual = await readFile(new URL("../app/(tabs)/ano.tsx", import.meta.url), "utf8");
const reset = await readFile(new URL("../app/report-password-reset.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../src/auth.tsx", import.meta.url), "utf8");

assert.match(api, /path === "\/reports\/password\/verify" && status === 401 && detail === "Senha de relatórios incorreta\."/);
assert.match(api, /path === "\/reports\/password\/recovery-reset" && status === 401/);
assert.match(api, /isReportRecoverySessionRejection\(path, res\.status\)/);
assert.match(api, /res\.status === 401 && !isReportPasswordRejection\(path, res\.status, data\?\.detail\)/);
assert.match(api, /onUnauthorized\?\.\(\)/);
assert.equal((annual.match(/testID="report-password-input"/g) ?? []).length, 1);
assert.equal((annual.match(/testID="report-password-submit"/g) ?? []).length, 1);
assert.equal((annual.match(/testID="report-password-recovery"/g) ?? []).length, 1);
assert.match(annual, /setGateError\(null\)/);
assert.match(annual, /Solicitação de recuperação recebida!/);
assert.match(annual, /e-mail associado à sua conta, caso ele esteja cadastrado/);
assert.match(annual, /caixa de entrada e também a pasta de spam/);
assert.match(annual, /Se não receber a mensagem em alguns minutos, aguarde antes de solicitar um novo envio/);
assert.equal((reset.match(/testID="report-reset-password"/g) ?? []).length, 1);
assert.equal((reset.match(/testID="report-reset-submit"/g) ?? []).length, 1);
assert.match(reset, /Esta senha protege a aba Ano e é diferente da senha da sua conta\./);
assert.match(reset, /As senhas não são iguais/);
assert.match(reset, /pelo menos 8 caracteres/);
assert.match(reset, /Não foi possível conectar ao CRM/);
assert.match(reset, /Senha salva com sucesso!/);
assert.match(reset, /Você será levado à aba Ano para entrar com sua nova senha/);
assert.match(reset, /report-reset-success/);
assert.match(api, /detail === "Senha de relatórios incorreta\."/);
assert.doesNotMatch(reset, /supabase\.auth\.updateUser/);
assert.match(auth, /"PASSWORD_RECOVERY"/);
assert.match(auth, /event === "USER_UPDATED" \|\| event === "PASSWORD_RECOVERY"/);

console.log("Report-password rejection preserves Google session; recovery UI, retry state, and separate password flow checks passed.");
