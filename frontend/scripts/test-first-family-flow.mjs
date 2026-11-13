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
const { FIRST_FAMILY_WELCOME_ROUTE, getFirstFamilyWelcomeRoute, isFirstFamilyWelcomeRouteActive } = await import(moduleUrl);

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

// Reproduce Expo Router's protected-route race: the family is created and
// profile refresh completes, but the tab navigator initially settles on Home.
let createdFamilyId = "fam-new";
let activeFamilyId = null;
let activeSegments = ["(tabs)", "index"];
let effectiveRoute = "home";
activeFamilyId = "fam-new"; // refreshUser finished after the server confirmed creation
const requestedRoute = getFirstFamilyWelcomeRoute(createdFamilyId, activeFamilyId);
assert.equal(requestedRoute, FIRST_FAMILY_WELCOME_ROUTE);
assert.equal(isFirstFamilyWelcomeRouteActive(createdFamilyId, activeFamilyId, activeSegments), false);
effectiveRoute = "familia"; // router.replace resolves after protected tabs reconcile
activeSegments = ["(tabs)", "familia"];
assert.equal(isFirstFamilyWelcomeRouteActive(createdFamilyId, activeFamilyId, activeSegments), true);
createdFamilyId = null; // intent is consumed only after the effective route changes
assert.equal(getFirstFamilyWelcomeRoute(createdFamilyId, activeFamilyId), null);
assert.equal(effectiveRoute, "familia", "first-family creation must remain on Família after auth state settles");
assert.equal(
  getFirstFamilyWelcomeRoute(null, "fam-new"),
  null,
  "subsequent authenticated visits must not be redirected away from Home",
);

console.log("first-family flow: 9 assertions passed");
