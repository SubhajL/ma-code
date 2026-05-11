export type FormFieldType = "text" | "email" | "password" | "search" | "tel" | "url";

export interface FormFieldProps {
  label: string;
  name: string;
  type?: FormFieldType;
  value?: string;
  hint?: string;
  errorMessage?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}

export interface FormFieldViewModel {
  label: string;
  name: string;
  type: FormFieldType;
  value: string;
  hint?: string;
  errorMessage?: string;
  disabled: boolean;
  required: boolean;
  invalid: boolean;
  inputId: string;
  hintId?: string;
  errorId?: string;
  ariaRequired: "true" | "false";
  ariaInvalid: "true" | "false";
  ariaDescribedBy?: string;
  state: "default" | "invalid" | "disabled";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "field";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createFormFieldViewModel(props: FormFieldProps): FormFieldViewModel {
  const name = props.name.trim() || slugify(props.label);
  const hint = props.hint?.trim() || undefined;
  const errorMessage = props.errorMessage?.trim() || undefined;
  const invalid = Boolean(props.invalid || errorMessage);
  const disabled = Boolean(props.disabled);
  const required = Boolean(props.required);
  const inputId = `${name}-input`;
  const hintId = hint ? `${name}-field-hint` : undefined;
  const errorId = errorMessage ? `${name}-field-error` : undefined;
  const ariaDescribedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return {
    label: props.label.trim() || "Field",
    name,
    type: props.type ?? "text",
    value: props.value ?? "",
    hint,
    errorMessage,
    disabled,
    required,
    invalid,
    inputId,
    hintId,
    errorId,
    ariaRequired: required ? "true" : "false",
    ariaInvalid: invalid ? "true" : "false",
    ariaDescribedBy,
    state: disabled ? "disabled" : invalid ? "invalid" : "default",
  };
}

export function renderFormFieldMarkup(viewModel: FormFieldViewModel): string {
  const inputAttributes = [
    `id="${viewModel.inputId}"`,
    `name="${viewModel.name}"`,
    `type="${viewModel.type}"`,
    `value="${escapeHtml(viewModel.value)}"`,
    `aria-required="${viewModel.ariaRequired}"`,
    `aria-invalid="${viewModel.ariaInvalid}"`,
  ];

  if (viewModel.ariaDescribedBy) {
    inputAttributes.push(`aria-describedby="${viewModel.ariaDescribedBy}"`);
  }

  if (viewModel.required) {
    inputAttributes.push("required");
  }

  if (viewModel.disabled) {
    inputAttributes.push("disabled");
  }

  const lines = [
    `<div data-state="${viewModel.state}">`,
    `  <label for="${viewModel.inputId}">${escapeHtml(viewModel.label)}</label>`,
    `  <input ${inputAttributes.join(" ")} />`,
  ];

  if (viewModel.hint && viewModel.hintId) {
    lines.push(`  <p id="${viewModel.hintId}">${escapeHtml(viewModel.hint)}</p>`);
  }

  if (viewModel.errorMessage && viewModel.errorId) {
    lines.push(`  <p id="${viewModel.errorId}" role="alert">${escapeHtml(viewModel.errorMessage)}</p>`);
  }

  lines.push(`</div>`);

  return lines.join("\n");
}
