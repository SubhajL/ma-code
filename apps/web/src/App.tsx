export const APP_SHELL_ROUTE = {
  path: "/",
  label: "Placeholder route",
} as const;

export interface AppShellViewModel {
  route: typeof APP_SHELL_ROUTE;
  title: string;
  description: string;
  backendDependency: false;
}

export function createAppShellViewModel(): AppShellViewModel {
  return {
    route: APP_SHELL_ROUTE,
    title: "Greenfield scaffold",
    description: "Placeholder route for the repository app shell.",
    backendDependency: false,
  };
}

export function renderAppShellMarkup(viewModel: AppShellViewModel = createAppShellViewModel()): string {
  return [
    `<main data-route="${viewModel.route.path}">`,
    `  <h1>${viewModel.title}</h1>`,
    `  <p>${viewModel.description}</p>`,
    `  <small>${viewModel.route.label}</small>`,
    `</main>`,
  ].join("\n");
}

export default function App(): string {
  return renderAppShellMarkup();
}
