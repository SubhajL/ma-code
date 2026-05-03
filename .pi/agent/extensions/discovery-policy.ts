import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

export const DISCOVERY_NEEDS = [
  "repo_semantic",
  "broad_structure",
  "exact_verification",
  "external_current_info",
] as const;

export const DISCOVERY_TOOLS = ["auggie", "graphify", "local", "exa"] as const;

export type DiscoveryNeed = (typeof DISCOVERY_NEEDS)[number];
export type DiscoveryTool = (typeof DISCOVERY_TOOLS)[number];

export interface DiscoveryPolicyInput {
  need: DiscoveryNeed;
  auggieAvailable?: boolean;
  graphifyAvailable?: boolean;
  graphifyFresh?: boolean;
  localTargetsKnown?: boolean;
  externalCurrentInfoNeeded?: boolean;
}

export interface DiscoveryPolicySelection {
  selectedTool: DiscoveryTool;
  localTools: ["read", "rg", "find"];
  orderedFallbacks: DiscoveryTool[];
  rationale: string[];
  requiredVerification: string[];
  policyDoc: string;
}

const POLICY_DOC = ".pi/agent/docs/discovery_policy.md";
const LOCAL_TOOLS: ["read", "rg", "find"] = ["read", "rg", "find"];

const SelectDiscoveryPolicySchema = Type.Object({
  need: StringEnum(DISCOVERY_NEEDS),
  auggieAvailable: Type.Optional(Type.Boolean()),
  graphifyAvailable: Type.Optional(Type.Boolean()),
  graphifyFresh: Type.Optional(Type.Boolean()),
  localTargetsKnown: Type.Optional(Type.Boolean()),
  externalCurrentInfoNeeded: Type.Optional(Type.Boolean()),
});

function uniqueTools(tools: DiscoveryTool[]): DiscoveryTool[] {
  return [...new Set(tools)];
}

function selection(
  selectedTool: DiscoveryTool,
  orderedFallbacks: DiscoveryTool[],
  rationale: string[],
  requiredVerification: string[],
): DiscoveryPolicySelection {
  return {
    selectedTool,
    localTools: LOCAL_TOOLS,
    orderedFallbacks: uniqueTools([selectedTool, ...orderedFallbacks, "local"]),
    rationale,
    requiredVerification,
    policyDoc: POLICY_DOC,
  };
}

export function selectDiscoveryPolicy(input: DiscoveryPolicyInput): DiscoveryPolicySelection {
  const auggieAvailable = input.auggieAvailable === true;
  const graphifyAvailable = input.graphifyAvailable === true;
  const graphifyFresh = input.graphifyFresh === true;

  if (input.need === "exact_verification" || (input.localTargetsKnown === true && input.need !== "external_current_info")) {
    return selection(
      "local",
      [],
      ["Use local read/rg/find for exact verification, narrow file inspection, static checks, and known-target evidence."],
      ["Use direct file evidence before implementation or completion claims."],
    );
  }

  if (input.need === "external_current_info" || input.externalCurrentInfoNeeded === true) {
    return selection(
      "exa",
      ["local"],
      ["Use Exa for current external web information, recent documentation, release notes, or third-party research that is not present in the repo."],
      ["Record source URLs or enough citation detail when Exa materially affects a decision."],
    );
  }

  if (input.need === "broad_structure") {
    if (graphifyAvailable && graphifyFresh) {
      return selection(
        "graphify",
        auggieAvailable ? ["auggie", "local"] : ["local"],
        ["Use Graphify for broad repo/corpus structure discovery when a bounded local graph or fresh artifact helps architecture, drift, dependency, or curated corpus questions."],
        ["Cite Graphify freshness/confidence metadata and verify important claims with direct file inspection."],
      );
    }

    if (graphifyAvailable) {
      return selection(
        "graphify",
        auggieAvailable ? ["auggie", "local"] : ["local"],
        ["Graphify is available but no fresh graph was reported; for broad structure discovery, run graphify_adapter preflight first, then run a bounded scan if preflight passes and graph evidence is still useful."],
        ["Run graphify_adapter action=preflight before any scan, keep output under the managed artifact path, and verify important Graphify-derived claims with direct file inspection."],
      );
    }

    if (auggieAvailable) {
      return selection(
        "auggie",
        ["local"],
        ["Graphify is unavailable; use Auggie for bounded repo-local semantic discovery before local verification."],
        ["Cross-check Auggie summaries with direct file verification."],
      );
    }

    return selection(
      "local",
      [],
      ["Graphify and Auggie are unavailable or not bounded; fallback to local read/rg/find for broad-structure evidence that can be directly inspected."],
      ["Record the local search path and inspect exact files before making claims."],
    );
  }

  if (auggieAvailable) {
    return selection(
      "auggie",
      graphifyAvailable && graphifyFresh ? ["graphify", "local"] : ["local"],
      ["Use Auggie first for bounded repo-local semantic discovery when codebase-level context is useful and Auggie is available."],
      ["Do not treat Auggie summaries as sufficient proof without direct file verification."],
    );
  }

  if (graphifyAvailable && graphifyFresh) {
    return selection(
      "graphify",
      ["local"],
      ["Auggie is unavailable; use fresh bounded Graphify evidence when broad repo/corpus structure can answer the discovery question."],
      ["Cite Graphify freshness/confidence metadata and verify important claims with direct file inspection."],
    );
  }

  return selection(
    "local",
    [],
    ["Auggie and Graphify are unavailable, stale, or not bounded; fallback to local read/rg/find."],
    ["Record the local search path and inspect exact files before making claims."],
  );
}

export default function discoveryPolicy(pi: ExtensionAPI) {
  pi.registerTool({
    name: "select_discovery_policy",
    label: "Select Discovery Policy",
    description: "Choose the bounded discovery path using the repo-local discovery policy.",
    promptSnippet: `Use ${POLICY_DOC} and select_discovery_policy before improvising Auggie, Graphify, local, or Exa discovery choices.`,
    promptGuidelines: [
      "Use this tool when choosing among Auggie, Graphify, local read/rg/find, and Exa discovery paths.",
      "The tool only selects and explains a policy path; it does not execute discovery tools.",
      "Always verify provider or indexed discovery summaries with direct local file evidence before completion claims.",
    ],
    parameters: SelectDiscoveryPolicySchema,
    async execute(_toolCallId, params) {
      const result = selectDiscoveryPolicy(params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { ok: true, ...result },
      };
    },
  });
}
