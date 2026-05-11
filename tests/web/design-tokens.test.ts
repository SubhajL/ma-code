import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  colorTokens,
  spacingTokens,
  themeTokens,
  typographyTokens,
} from "../../apps/web/src/styles/theme.ts";

function extractDefinedCssVariables(source: string): Set<string> {
  return new Set([...source.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

function extractReferencedCssVariables(tokens: Record<string, string>): string[] {
  return Object.values(tokens).map((value) => {
    const match = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    assert.ok(match, `Expected token reference to use a CSS variable, received: ${value}`);
    return match[1];
  });
}

test("design token scaffold exposes color, spacing, and typography primitives", () => {
  assert.deepEqual(Object.keys(themeTokens), ["color", "spacing", "typography"]);
  assert.ok(Object.keys(colorTokens).length > 0);
  assert.ok(Object.keys(spacingTokens).length > 0);
  assert.ok(Object.keys(typographyTokens).length > 0);
});

test("design token css defines every referenced primitive", () => {
  const cssSource = readFileSync(new URL("../../apps/web/src/styles/tokens.css", import.meta.url), "utf8");
  const definedCssVariables = extractDefinedCssVariables(cssSource);

  for (const variable of [
    ...extractReferencedCssVariables(colorTokens),
    ...extractReferencedCssVariables(spacingTokens),
    ...extractReferencedCssVariables(typographyTokens),
  ]) {
    assert.ok(definedCssVariables.has(variable), `Missing CSS token definition for ${variable}`);
  }
});
