export type CardState = "default" | "info" | "success" | "warning" | "error";

export interface CardProps {
  title: string;
  description?: string;
  state?: CardState;
}

export interface CardViewModel {
  title: string;
  description?: string;
  state: CardState;
  titleId: string;
  descriptionId?: string;
  stateId: string;
  ariaLabelledBy: string;
  ariaDescribedBy?: string;
  stateLabel: string;
}

const CARD_STATE_LABELS: Record<CardState, string> = {
  default: "Neutral",
  info: "Informational",
  success: "Ready",
  warning: "Attention needed",
  error: "Action required",
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "card";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createCardViewModel(props: CardProps): CardViewModel {
  const title = props.title.trim() || "Card";
  const description = props.description?.trim() || undefined;
  const state = props.state ?? "default";
  const baseId = `${slugify(title)}-card`;
  const descriptionId = description ? `${baseId}-description` : undefined;
  const stateId = `${baseId}-state`;
  const ariaDescribedBy = [descriptionId, stateId].filter(Boolean).join(" ") || undefined;

  return {
    title,
    description,
    state,
    titleId: `${baseId}-title`,
    descriptionId,
    stateId,
    ariaLabelledBy: `${baseId}-title`,
    ariaDescribedBy,
    stateLabel: CARD_STATE_LABELS[state],
  };
}

export function renderCardMarkup(viewModel: CardViewModel): string {
  const attributes = [
    `data-state="${viewModel.state}"`,
    `aria-labelledby="${viewModel.ariaLabelledBy}"`,
  ];

  if (viewModel.ariaDescribedBy) {
    attributes.push(`aria-describedby="${viewModel.ariaDescribedBy}"`);
  }

  const lines = [
    `<article ${attributes.join(" ")}>`,
    `  <h2 id="${viewModel.titleId}">${escapeHtml(viewModel.title)}</h2>`,
  ];

  if (viewModel.description && viewModel.descriptionId) {
    lines.push(`  <p id="${viewModel.descriptionId}">${escapeHtml(viewModel.description)}</p>`);
  }

  lines.push(`  <p id="${viewModel.stateId}" role="status" aria-live="polite">State: ${viewModel.stateLabel}</p>`);
  lines.push(`</article>`);

  return lines.join("\n");
}
