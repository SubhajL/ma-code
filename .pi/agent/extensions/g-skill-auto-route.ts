import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export type SkillName = "g-planning" | "g-coding" | "g-check" | "g-review" | "g-create" | "g-submit";

export interface SkillRoute {
  skill: SkillName;
  reason: string;
  transformed: boolean;
  originalText: string;
}

const pendingRoutes: Array<SkillRoute | null> = [];

const EXPLICIT_SKILL_COMMAND = /^\/skill:(g-planning|g-coding|g-check|g-review|g-create|g-submit)\b/i;

export const SKILL_PATTERNS: Array<{ skill: SkillName; reason: string; patterns: RegExp[] }> = [
  {
    skill: "g-review",
    reason: "matched architecture/codebase review intent",
    patterns: [
      /\bg-review\b/i,
      /\breview\s+codebase\b/i,
      /\breview\s+architecture\b/i,
      /\bsystem\s+review\b/i,
      /\bas-is\s+review\b/i,
      /\bdrift\s+review\b/i,
      /\bholistic\s+review\b/i,
    ],
  },
  {
    skill: "g-check",
    reason: "matched bounded change review intent",
    patterns: [
      /\bg-check\b/i,
      /\breview\s+changes\b/i,
      /\breview\s+diff\b/i,
      /\bcheck\s+changes\b/i,
      /\bverify\s+changes\b/i,
      /\bworking\s+tree\s+review\b/i,
      /\bpr\s+review\b/i,
      /\bcommit\s+review\b/i,
    ],
  },
  {
    skill: "g-submit",
    reason: "matched PR submission intent",
    patterns: [
      /\bg-submit\b/i,
      /\bsubmit\s+(the\s+)?pr\b/i,
      /\bsubmit\s+(a\s+)?pull\s+request\b/i,
      /\bcreate\s+(a\s+)?pr\b/i,
      /\bopen\s+(a\s+)?pr\b/i,
      /\bpublish\s+(the\s+)?pr\b/i,
      /\bprepare\s+(a\s+)?pr\b/i,
    ],
  },
  {
    skill: "g-create",
    reason: "matched branch/commit creation intent",
    patterns: [
      /\bg-create\b/i,
      /\bgt\s+create\b/i,
      /\bcreate\s+(the\s+)?commit\b/i,
      /\bprepare\s+(the\s+)?commit\b/i,
      /\bstage\s+and\s+commit\b/i,
      /\bcreate\s+(the\s+)?branch\b/i,
      /\bprepare\s+(the\s+)?branch\b/i,
    ],
  },
  {
    skill: "g-planning",
    reason: "matched planning/design intent",
    patterns: [
      /\bg-planning\b/i,
      /\bimplementation\s+plan\b/i,
      /\bbreak\s+down\b/i,
      /\bplanning\b/i,
      /\bplan\b/i,
      /\bdesign\b/i,
      /\bapproach\b/i,
    ],
  },
  {
    skill: "g-coding",
    reason: "matched implementation/debugging intent",
    patterns: [
      /\bg-coding\b/i,
      /\bimplementation\b/i,
      /\bimplement\b/i,
      /\bcoding\b/i,
      /\bcode\b/i,
      /\bdebug\b/i,
      /\bfix\b/i,
      /\bpatch\b/i,
      /\brefactor\b/i,
      /\bedit\b/i,
    ],
  },
];

export function detectSkillRoute(text: string): SkillRoute | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(EXPLICIT_SKILL_COMMAND);
  if (explicit) {
    return {
      skill: explicit[1].toLowerCase() as SkillName,
      reason: "explicit /skill command",
      transformed: false,
      originalText: trimmed,
    };
  }

  if (trimmed.startsWith("/")) return null;

  for (const entry of SKILL_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(trimmed))) {
      return {
        skill: entry.skill,
        reason: entry.reason,
        transformed: true,
        originalText: trimmed,
      };
    }
  }

  return null;
}

export function buildSkillCommand(route: SkillRoute): string {
  return `/skill:${route.skill} ${route.originalText}`;
}

export default function gSkillAutoRoute(pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    const route = event.source === "extension" ? null : detectSkillRoute(event.text);
    pendingRoutes.push(route);

    if (!route) {
      return { action: "continue" };
    }

    if (!route.transformed) {
      return { action: "continue" };
    }

    return {
      action: "transform",
      text: buildSkillCommand(route),
    };
  });

  pi.on("before_agent_start", async (event) => {
    const route = pendingRoutes.shift() ?? null;
    if (!route) return undefined;

    return {
      message: {
        customType: "g-skill-auto-route",
        content:
          `[G-SKILL AUTO-ROUTE]\n` +
          `Selected skill: ${route.skill}\n` +
          `Reason: ${route.reason}\n` +
          `Original prompt: ${route.originalText}`,
        display: false,
      },
      systemPrompt:
        event.systemPrompt +
        `\n\n[G-SKILL AUTO-ROUTE]\n` +
        `This turn was routed to \`${route.skill}\` because ${route.reason}. ` +
        `Follow that skill's workflow for this turn. ` +
        `If the routed skill and the user's explicit request conflict materially, say so briefly and resolve conservatively.`,
    };
  });
}
