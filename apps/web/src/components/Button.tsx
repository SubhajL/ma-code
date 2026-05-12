export type ButtonType = "button" | "submit" | "reset";

export interface ButtonProps {
  label: string;
  description?: string;
  type?: ButtonType;
  disabled?: boolean;
  busy?: boolean;
}

export interface ButtonViewModel {
  label: string;
  description?: string;
  descriptionId?: string;
  type: ButtonType;
  disabled: boolean;
  busy: boolean;
  ariaLabel: string;
  ariaDisabled: "true" | "false";
  ariaBusy: "true" | "false";
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "button";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createButtonViewModel(props: ButtonProps): ButtonViewModel {
  const label = props.label.trim() || "Button";
  const description = props.description?.trim() || undefined;
  const disabled = Boolean(props.disabled);
  const busy = Boolean(props.busy);

  return {
    label,
    description,
    descriptionId: description ? `${slugify(label)}-button-description` : undefined,
    type: props.type ?? "button",
    disabled,
    busy,
    ariaLabel: busy ? `${label} (loading)` : label,
    ariaDisabled: disabled ? "true" : "false",
    ariaBusy: busy ? "true" : "false",
  };
}

export function renderButtonMarkup(viewModel: ButtonViewModel): string {
  const attributes = [
    `type="${viewModel.type}"`,
    `aria-label="${escapeHtml(viewModel.ariaLabel)}"`,
    `aria-disabled="${viewModel.ariaDisabled}"`,
    `aria-busy="${viewModel.ariaBusy}"`,
  ];

  if (viewModel.disabled) {
    attributes.push("disabled");
  }

  if (viewModel.descriptionId) {
    attributes.push(`aria-describedby="${viewModel.descriptionId}"`);
  }

  const lines = [`<button ${attributes.join(" ")}>${escapeHtml(viewModel.label)}</button>`];

  if (viewModel.description && viewModel.descriptionId) {
    lines.push(`<span id="${viewModel.descriptionId}">${escapeHtml(viewModel.description)}</span>`);
  }

  return lines.join("\n");
}
