import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_SHELL_ROUTE,
  createAppShellViewModel,
  renderAppShellMarkup,
} from "./App.tsx";

test("app shell exposes a placeholder route contract without backend dependencies", () => {
  assert.equal(APP_SHELL_ROUTE.path, "/");
  assert.match(APP_SHELL_ROUTE.label, /placeholder/i);

  const viewModel = createAppShellViewModel();
  assert.equal(viewModel.route.path, "/");
  assert.equal(viewModel.backendDependency, false);

  const markup = renderAppShellMarkup(viewModel);
  assert.match(markup, /Greenfield scaffold/i);
  assert.match(markup, /Placeholder route/i);
});
