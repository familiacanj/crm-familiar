import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceUrl = new URL("../src/first-family-flow.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { FIRST_FAMILY_WELCOME_ROUTE, getFirstFamilyWelcomeRoute } = await import(moduleUrl);

assert.equal(
  getFirstFamilyWelcomeRoute("fam-new", "fam-new"),
  FIRST_FAMILY_WELCOME_ROUTE,
  "a newly created family must open the Família tab with the welcome message",
);
assert.equal(
  getFirstFamilyWelcomeRoute("fam-new", null),
  null,
  "the welcome route must wait until the authenticated profile has the new family",
);
assert.equal(
  getFirstFamilyWelcomeRoute(null, "fam-existing"),
  null,
  "later application starts must keep the normal Home route",
);

console.log("first-family flow: 3 assertions passed");
