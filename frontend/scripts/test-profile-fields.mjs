import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/profile-fields.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = `data:text/javascript;base64,${globalThis.Buffer.from(compiled).toString("base64")}`;
const { ageFromBirthDate, formatBirthDate, maskBirthDate, parseBrazilianBirthDate } = await import(url);
const today = new Date(2026, 10, 17);

assert.equal(maskBirthDate("29a02-2000"), "29/02/2000");
assert.equal(maskBirthDate("1"), "1");
assert.equal(formatBirthDate("2000-02-29"), "29/02/2000");
assert.equal(formatBirthDate("2001-02-29"), "");
assert.equal(parseBrazilianBirthDate("29/02/2000", today), "2000-02-29");
assert.equal(parseBrazilianBirthDate("29/02/2023", today), null);
assert.equal(parseBrazilianBirthDate("31/04/2000", today), null);
assert.equal(parseBrazilianBirthDate("17/11/2026", today), "2026-11-17");
assert.equal(parseBrazilianBirthDate("18/11/2026", today), null);
assert.equal(parseBrazilianBirthDate("01/01/1899", today), null);
assert.equal(ageFromBirthDate("2008-11-18", today), 17);
assert.equal(ageFromBirthDate("2008-11-17", today), 18);

console.log("profile fields: 12 assertions passed");
