import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createButtonViewModel, renderButtonMarkup } from "../../apps/web/src/components/Button.tsx";
import { createCardViewModel, renderCardMarkup } from "../../apps/web/src/components/Card.tsx";
import { createFormFieldViewModel, renderFormFieldMarkup } from "../../apps/web/src/components/FormField.tsx";

test("Button renders an accessible label with disabled and busy states", () => {
  const viewModel = createButtonViewModel({
    label: "Save changes",
    description: "Persists the current form.",
    disabled: true,
    busy: true,
  });

  assert.equal(viewModel.ariaLabel, "Save changes (loading)");
  assert.equal(viewModel.ariaDisabled, "true");
  assert.equal(viewModel.ariaBusy, "true");

  const markup = renderButtonMarkup(viewModel);
  assert.match(markup, /<button[^>]*type="button"/);
  assert.match(markup, /aria-label="Save changes \(loading\)"/);
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /disabled/);
  assert.match(markup, /aria-describedby="save-changes-button-description"/);
  assert.match(markup, /id="save-changes-button-description"/);
  assert.match(markup, />Save changes<\/button>/);
});

test("Card renders an accessible heading association with status messaging", () => {
  const viewModel = createCardViewModel({
    title: "Deployment pipeline",
    description: "CI checks for the greenfield scaffold.",
    state: "warning",
  });

  assert.equal(viewModel.ariaLabelledBy, "deployment-pipeline-card-title");
  assert.equal(viewModel.ariaDescribedBy, "deployment-pipeline-card-description deployment-pipeline-card-state");

  const markup = renderCardMarkup(viewModel);
  assert.match(markup, /<article[^>]*aria-labelledby="deployment-pipeline-card-title"/);
  assert.match(markup, /aria-describedby="deployment-pipeline-card-description deployment-pipeline-card-state"/);
  assert.match(markup, /id="deployment-pipeline-card-title"/);
  assert.match(markup, /id="deployment-pipeline-card-description"/);
  assert.match(markup, /<p id="deployment-pipeline-card-state" role="status" aria-live="polite">State: Attention needed<\/p>/);
});

test("FormField renders a label, hint, and invalid state accessibly", () => {
  const viewModel = createFormFieldViewModel({
    label: "Email address",
    name: "email",
    type: "email",
    required: true,
    invalid: true,
    hint: "We will send project updates here.",
    errorMessage: "Enter a valid email address.",
  });

  assert.equal(viewModel.inputId, "email-input");
  assert.equal(viewModel.ariaRequired, "true");
  assert.equal(viewModel.ariaInvalid, "true");
  assert.equal(viewModel.ariaDescribedBy, "email-field-hint email-field-error");

  const markup = renderFormFieldMarkup(viewModel);
  assert.match(markup, /<label for="email-input">Email address<\/label>/);
  assert.match(markup, /<input[^>]*id="email-input"/);
  assert.match(markup, /name="email"/);
  assert.match(markup, /type="email"/);
  assert.match(markup, /<input[^>]*\srequired(?:\s|\/?>)/);
  assert.match(markup, /aria-required="true"/);
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /aria-describedby="email-field-hint email-field-error"/);
  assert.match(markup, /<p id="email-field-hint">We will send project updates here\.<\/p>/);
  assert.match(markup, /<p id="email-field-error" role="alert">Enter a valid email address\.<\/p>/);
});

test("issue-007 Phase A materialization remains not_ready", () => {
  const summary = JSON.parse(
    readFileSync(new URL("../../docs/initiatives/greenfield-scaffold/slices/issue-007.summary.json", import.meta.url), "utf8"),
  );

  assert.equal(summary.issueId, "issue-007");
  assert.equal(summary.queueReadiness, "not_ready");
});
