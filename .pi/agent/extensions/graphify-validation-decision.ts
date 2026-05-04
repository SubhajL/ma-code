export const GRAPHIFY_VALIDATION_DECISION_STATES = [
  "not_applicable",
  "optional_skipped",
  "required_missing",
  "freshness_checked",
  "queried",
  "source_verified",
  "pass",
  "fail",
  "blocked",
] as const;

export type GraphifyValidationDecisionState = (typeof GRAPHIFY_VALIDATION_DECISION_STATES)[number];

export type GraphifyMissingProof =
  | "latest_relevant_graph_queried_or_freshness_cadence_checked"
  | "important_claims_verified_with_direct_source_inspection";

export interface GraphifyValidationDecisionInput {
  graphifyBackedClaim: boolean;
  required?: boolean;
  freshnessOrCadenceChecked?: boolean;
  latestRelevantGraphQueried?: boolean;
  importantClaimsSourceVerified?: boolean;
  explicitFailure?: boolean;
}

export interface GraphifyValidationDecision {
  state: GraphifyValidationDecisionState;
  pass: boolean;
  blocking: boolean;
  missingProof: GraphifyMissingProof[];
  reason: string;
}

const GRAPH_OR_FRESHNESS_PROOF: GraphifyMissingProof = "latest_relevant_graph_queried_or_freshness_cadence_checked";
const SOURCE_VERIFICATION_PROOF: GraphifyMissingProof = "important_claims_verified_with_direct_source_inspection";

export function decideGraphifyValidation(input: GraphifyValidationDecisionInput): GraphifyValidationDecision {
  const required = input.required === true;
  const graphOrFreshnessProved = input.latestRelevantGraphQueried === true || input.freshnessOrCadenceChecked === true;
  const sourceVerified = input.importantClaimsSourceVerified === true;

  if (!input.graphifyBackedClaim) {
    return {
      state: "not_applicable",
      pass: true,
      blocking: false,
      missingProof: [],
      reason: "No Graphify-backed claim was presented, so Graphify validation is not applicable.",
    };
  }

  if (input.explicitFailure) {
    return {
      state: required ? "blocked" : "fail",
      pass: false,
      blocking: required,
      missingProof: [],
      reason: required
        ? "Required Graphify-backed validation reported an explicit failure and blocks acceptance."
        : "Optional Graphify-backed validation reported an explicit failure.",
    };
  }

  const missingProof: GraphifyMissingProof[] = [];
  if (!graphOrFreshnessProved) missingProof.push(GRAPH_OR_FRESHNESS_PROOF);
  if (!sourceVerified) missingProof.push(SOURCE_VERIFICATION_PROOF);

  if (missingProof.length === 0) {
    return {
      state: "pass",
      pass: true,
      blocking: false,
      missingProof,
      reason: "Graphify-backed acceptance has graph query or freshness/cadence proof plus direct source verification for important claims.",
    };
  }

  if (required) {
    return {
      state: missingProof.length === 2 ? "blocked" : "required_missing",
      pass: false,
      blocking: true,
      missingProof,
      reason: "Required Graphify-backed acceptance cannot pass until latest relevant graph query or freshness/cadence proof and direct source inspection are present.",
    };
  }

  if (sourceVerified) {
    return {
      state: "source_verified",
      pass: false,
      blocking: false,
      missingProof,
      reason: "Important claims were source-verified, but Graphify query or freshness/cadence proof is still missing.",
    };
  }

  if (input.latestRelevantGraphQueried === true) {
    return {
      state: "queried",
      pass: false,
      blocking: false,
      missingProof,
      reason: "Latest relevant graph was queried, but important claims still need direct source verification.",
    };
  }

  if (input.freshnessOrCadenceChecked === true) {
    return {
      state: "freshness_checked",
      pass: false,
      blocking: false,
      missingProof,
      reason: "Graph freshness/cadence was checked, but important claims still need direct source verification.",
    };
  }

  return {
    state: "optional_skipped",
    pass: true,
    blocking: false,
    missingProof,
    reason: "Graphify-backed claim was optional and no Graphify validation proof was supplied.",
  };
}
