import { createAppShellViewModel, renderAppShellMarkup } from "./App.tsx";

export function bootstrapAppShell(target?: { innerHTML: string }): string {
  const markup = renderAppShellMarkup(createAppShellViewModel());
  if (target) target.innerHTML = markup;
  return markup;
}

if (typeof document !== "undefined" && document.body) {
  bootstrapAppShell(document.body);
}
