const INITIATIVE_RUNTIME_DIR_PATTERN = /^docs\/initiatives\/[^/]+\/(?:pipeline-runs|afk-runs|worker-runs|pr-runs)(?:\/|$)/;

function normalizeGitStatusPath(pathValue: string): string {
  return pathValue.trim().replace(/\\/g, "/");
}

function extractGitStatusPaths(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.length <= 3) return [];
  const payload = trimmed.slice(3).trim();
  if (!payload) return [];
  return payload.includes(" -> ")
    ? payload.split(" -> ").map((part) => normalizeGitStatusPath(part)).filter(Boolean)
    : [normalizeGitStatusPath(payload)];
}

export function isInitiativeRuntimeArtifactPath(pathValue: string): boolean {
  return INITIATIVE_RUNTIME_DIR_PATTERN.test(normalizeGitStatusPath(pathValue));
}

export function filterMeaningfulGitDirtyLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const paths = extractGitStatusPaths(line);
    return paths.length === 0 || !paths.every(isInitiativeRuntimeArtifactPath);
  });
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function gitDirtyRuntimeArtifactsExtension(): void {}
