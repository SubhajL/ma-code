export const GRAPHIFY_ORCHESTRATION_ACTIONS = [
  "not_needed",
  "use_local_verification",
  "graphify_unavailable",
  "run_preflight",
  "request_approval",
  "run_scan",
  "check_freshness",
  "query_graph",
  "verify_sources",
  "ready",
  "blocked",
] as const;

export type GraphifyOrchestrationAction = (typeof GRAPHIFY_ORCHESTRATION_ACTIONS)[number];

export type GraphifyOrchestrationNeed = "none" | "exact_verification" | "broad_structure" | "architecture_review";
export type GraphifyOrchestrationPurpose =
  | "architecture_review"
  | "dependency_exploration"
  | "drift_analysis"
  | "large_subsystem_mapping"
  | "curated_research";
export type GraphifyOrchestrationFreshnessStatus = "fresh" | "stale_head" | "dirty_worktree" | "missing_metadata" | "missing_graph";

export interface GraphifyOrchestrationDecisionInput {
  need: GraphifyOrchestrationNeed;
  graphifyAvailable?: boolean;
  localFallbackAllowed?: boolean;
  graphPresent?: boolean;
  freshnessStatus?: GraphifyOrchestrationFreshnessStatus;
  purpose?: GraphifyOrchestrationPurpose;
  preflightTokenPresent?: boolean;
  largeCorpus?: boolean;
  approvedLargeCorpus?: boolean;
  latestRelevantGraphQueried?: boolean;
  importantClaimsSourceVerified?: boolean;
  explicitBlocker?: boolean;
}

export interface GraphifyOrchestrationDecision {
  action: GraphifyOrchestrationAction;
  shouldUseGraphify: boolean;
  blocking: boolean;
  ready: boolean;
  requiresPreflight: boolean;
  requiresApproval: boolean;
  requiresFreshnessCheck: boolean;
  requiresQuery: boolean;
  requiresSourceVerification: boolean;
  reason: string;
}

function decision(
  action: GraphifyOrchestrationAction,
  reason: string,
  flags: Partial<Omit<GraphifyOrchestrationDecision, "action" | "reason">> = {},
): GraphifyOrchestrationDecision {
  return {
    action,
    shouldUseGraphify: false,
    blocking: false,
    ready: false,
    requiresPreflight: false,
    requiresApproval: false,
    requiresFreshnessCheck: false,
    requiresQuery: false,
    requiresSourceVerification: false,
    ...flags,
    reason,
  };
}

function graphifyNeedIsBroad(need: GraphifyOrchestrationNeed): boolean {
  return need === "broad_structure" || need === "architecture_review";
}

export function decideGraphifyOrchestration(input: GraphifyOrchestrationDecisionInput): GraphifyOrchestrationDecision {
  if (input.explicitBlocker) {
    return decision("blocked", "Graphify orchestration is blocked by an explicit caller-provided blocker.", { blocking: true });
  }

  if (input.need === "none") {
    return decision("not_needed", "No discovery need was requested, so Graphify orchestration is not needed.");
  }

  if (!graphifyNeedIsBroad(input.need)) {
    return decision("use_local_verification", "The discovery need is narrow/exact, so local read/rg/find verification is preferred over Graphify.");
  }

  if (input.graphifyAvailable === false) {
    const blocking = input.localFallbackAllowed === false;
    return decision(
      "graphify_unavailable",
      blocking
        ? "Graphify is unavailable and local fallback was not allowed for this broad discovery request."
        : "Graphify is unavailable; use local fallback verification or another bounded discovery path.",
      { blocking },
    );
  }

  if (input.graphPresent !== true || input.freshnessStatus === "missing_graph") {
    if (!input.purpose) {
      return decision("run_preflight", "No reusable graph is present; run Graphify preflight with a broad discovery purpose before scanning.", {
        shouldUseGraphify: true,
        requiresPreflight: true,
      });
    }

    if (input.preflightTokenPresent !== true) {
      return decision("run_preflight", "No reusable graph is present; a matching preflight token is required before a bounded scan.", {
        shouldUseGraphify: true,
        requiresPreflight: true,
      });
    }

    if (input.largeCorpus === true && input.approvedLargeCorpus !== true) {
      return decision("request_approval", "Large-corpus Graphify scan requires explicit approval before scanning.", {
        shouldUseGraphify: true,
        blocking: true,
        requiresApproval: true,
      });
    }

    return decision("run_scan", "Preflight proof is present; run one bounded Graphify scan for the broad discovery request.", {
      shouldUseGraphify: true,
    });
  }

  if (input.freshnessStatus === "dirty_worktree") {
    return decision("use_local_verification", "Dirty worktree means the graph may be stale; prefer local verification instead of rescanning in this decision slice.");
  }

  if (input.freshnessStatus && input.freshnessStatus !== "fresh") {
    return decision("check_freshness", "Existing Graphify graph is not known fresh; check freshness/cadence before reuse or rescan decisions.", {
      shouldUseGraphify: true,
      requiresFreshnessCheck: true,
    });
  }

  if (input.latestRelevantGraphQueried !== true) {
    return decision("query_graph", "Fresh Graphify graph is available; query the latest relevant graph before using it for planning or validation.", {
      shouldUseGraphify: true,
      requiresQuery: true,
    });
  }

  if (input.importantClaimsSourceVerified !== true) {
    return decision("verify_sources", "Graphify query evidence is present; directly verify important claims in source files before acceptance.", {
      shouldUseGraphify: true,
      requiresSourceVerification: true,
    });
  }

  return decision("ready", "Fresh/query-backed Graphify evidence has direct source verification and is ready to consume.", {
    shouldUseGraphify: true,
    ready: true,
  });
}
