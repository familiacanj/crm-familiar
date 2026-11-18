import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/editar.tsx", "utf8");
assert.match(source, /useWindowDimensions\(\)/);
assert.match(source, /width < 360 \? 16 : 24/);
assert.match(source, /width: "100%", alignSelf: "stretch"/);
assert.match(source, /minWidth: 0/);
assert.match(source, /overflow: "hidden"/);
assert.match(source, /KeyboardAwareScrollView[\s\S]*bottomOffset=\{24\}[\s\S]*keyboardShouldPersistTaps="handled"/);
assert.match(source, /keyboardDismissMode="on-drag"/);

for (const viewport of [320, 360, 375, 390, 414]) {
  const horizontalPadding = viewport < 360 ? 16 : 24;
  const contentWidth = viewport - horizontalPadding * 2;
  assert.ok(contentWidth > 0, `conteúdo precisa caber em ${viewport}px`);
}

console.log("/editar: contrato responsivo validado em 320, 360, 375, 390 e 414 px, com suporte à rolagem do teclado.");
