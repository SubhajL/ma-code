import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { HarnessRole } from "./harness-routing.ts";
import type { DomainId, WorkType } from "./team-activation.ts";

export type GovernedDomain = Extract<DomainId, "frontend" | "backend" | "infra">;
export type PathOwnershipMode = "advisory_first" | "blocking";
export type DomainDocBootstrapMode = "conditional" | "always" | "never";

export interface MixedDomainRules {
  allowedOnlyWhenExplicit: boolean;
  requiresEscalationOrMixedDomainNote: boolean;
  acceptedEvidencePhrases: string[];
}

export interface DomainGovernancePolicy {
  version: 1;
  policyName: string;
  description?: string;
  domainRoleDefaults: Record<GovernedDomain, HarnessRole>;
  mixedDomainRules: MixedDomainRules;
  pathOwnershipMode: PathOwnershipMode;
  requiredPacketFields: string[];
  domainDocBootstrap: Record<"frontend" | "backend", DomainDocBootstrapMode>;
}

export interface DomainGovernanceInput {
  domains?: DomainId[];
  assignedRole: HarnessRole;
  workType?: WorkType;
  allowedPaths?: string[];
  filesToModify?: string[];
  escalationInstructions?: string[];
  migrationPathNote?: string;
  mixedDomainJustification?: string;
}

export interface DomainGovernanceAssessment {
  pass: boolean;
  warnings: string[];
  blockReasons: string[];
  expectedRoleByDomain: Partial<Record<GovernedDomain, HarnessRole>>;
  normalizedDomains: DomainId[];
}

const POLICY_PATH = ".pi/agent/governance/domain-governance-policy.json";
const GOVERNED_DOMAINS: GovernedDomain[] = ["frontend", "backend", "infra"];
const VALID_ROLES = new Set<HarnessRole>([
  "orchestrator",
  "planning_lead",
  "build_lead",
  "quality_lead",
  "research_worker",
  "frontend_worker",
  "backend_worker",
  "infra_worker",
  "reviewer_worker",
  "validator_worker",
  "docs_worker",
  "recovery_worker",
]);
const VALID_DOMAINS = new Set<DomainId>(["frontend", "backend", "infra", "docs", "research"]);

export const DEFAULT_DOMAIN_GOVERNANCE_POLICY: DomainGovernancePolicy = {
  version: 1,
  policyName: "domain-governance-phase-7",
  description: "Advisory-first domain ownership governance for task packets, team activation, and feature bootstrap docs. No mutable runtime state is introduced.",
  domainRoleDefaults: {
    frontend: "frontend_worker",
    backend: "backend_worker",
    infra: "infra_worker",
  },
  mixedDomainRules: {
    allowedOnlyWhenExplicit: true,
    requiresEscalationOrMixedDomainNote: true,
    acceptedEvidencePhrases: ["mixed-domain", "multi-lane", "escalation", "frontend review", "backend review"],
  },
  pathOwnershipMode: "advisory_first",
  requiredPacketFields: ["domains", "assignedRole", "allowedPaths", "filesToModify"],
  domainDocBootstrap: {
    frontend: "conditional",
    backend: "conditional",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()) : [];
}

function parseRole(raw: unknown, fieldName: string): HarnessRole {
  if (typeof raw !== "string" || !VALID_ROLES.has(raw as HarnessRole)) {
    throw new Error(`${fieldName} must be a valid harness role.`);
  }
  return raw as HarnessRole;
}

export function parseDomainGovernancePolicy(raw: unknown): DomainGovernancePolicy {
  if (!isRecord(raw)) throw new Error("Domain governance policy must be an object.");
  if (raw.version !== 1) throw new Error("Domain governance policy version must be 1.");
  if (typeof raw.policyName !== "string" || raw.policyName.trim().length === 0) throw new Error("policyName is required.");
  if (!isRecord(raw.domainRoleDefaults)) throw new Error("domainRoleDefaults is required.");
  if (!isRecord(raw.mixedDomainRules)) throw new Error("mixedDomainRules is required.");
  if (raw.pathOwnershipMode !== "advisory_first" && raw.pathOwnershipMode !== "blocking") throw new Error("pathOwnershipMode must be advisory_first or blocking.");
  if (!isRecord(raw.domainDocBootstrap)) throw new Error("domainDocBootstrap is required.");

  const domainRoleDefaults = {} as Record<GovernedDomain, HarnessRole>;
  for (const domain of GOVERNED_DOMAINS) {
    domainRoleDefaults[domain] = parseRole(raw.domainRoleDefaults[domain], `domainRoleDefaults.${domain}`);
  }

  const acceptedEvidencePhrases = parseStringArray(raw.mixedDomainRules.acceptedEvidencePhrases);
  if (acceptedEvidencePhrases.length === 0) throw new Error("mixedDomainRules.acceptedEvidencePhrases must not be empty.");

  return {
    version: 1,
    policyName: raw.policyName.trim(),
    description: typeof raw.description === "string" ? raw.description.trim() : undefined,
    domainRoleDefaults,
    mixedDomainRules: {
      allowedOnlyWhenExplicit: raw.mixedDomainRules.allowedOnlyWhenExplicit === true,
      requiresEscalationOrMixedDomainNote: raw.mixedDomainRules.requiresEscalationOrMixedDomainNote === true,
      acceptedEvidencePhrases,
    },
    pathOwnershipMode: raw.pathOwnershipMode,
    requiredPacketFields: parseStringArray(raw.requiredPacketFields),
    domainDocBootstrap: {
      frontend: raw.domainDocBootstrap.frontend === "always" || raw.domainDocBootstrap.frontend === "never" ? raw.domainDocBootstrap.frontend : "conditional",
      backend: raw.domainDocBootstrap.backend === "always" || raw.domainDocBootstrap.backend === "never" ? raw.domainDocBootstrap.backend : "conditional",
    },
  };
}

export async function loadDomainGovernancePolicy(cwd: string): Promise<DomainGovernancePolicy> {
  const raw = await readFile(resolve(cwd, POLICY_PATH), "utf8");
  return parseDomainGovernancePolicy(JSON.parse(raw));
}

function uniqueDomains(domains: DomainId[] | undefined): DomainId[] {
  return [...new Set((domains ?? []).filter((domain): domain is DomainId => VALID_DOMAINS.has(domain)))];
}

function hasMixedDomainEvidence(policy: DomainGovernancePolicy, input: DomainGovernanceInput): boolean {
  const haystack = [
    ...(input.escalationInstructions ?? []),
    input.migrationPathNote ?? "",
    input.mixedDomainJustification ?? "",
  ].join("\n").toLowerCase();
  return policy.mixedDomainRules.acceptedEvidencePhrases.some((phrase) => haystack.includes(phrase.toLowerCase()));
}

export function assessDomainGovernance(policy: DomainGovernancePolicy, input: DomainGovernanceInput): DomainGovernanceAssessment {
  const normalizedDomains = uniqueDomains(input.domains);
  const warnings: string[] = [];
  const blockReasons: string[] = [];
  const expectedRoleByDomain: Partial<Record<GovernedDomain, HarnessRole>> = {};

  const mixedDomainExplicit = normalizedDomains.length > 1 && hasMixedDomainEvidence(policy, input);

  for (const domain of normalizedDomains) {
    if (!GOVERNED_DOMAINS.includes(domain as GovernedDomain)) continue;
    const governedDomain = domain as GovernedDomain;
    const expectedRole = policy.domainRoleDefaults[governedDomain];
    expectedRoleByDomain[governedDomain] = expectedRole;
    if (input.assignedRole !== expectedRole) {
      const message = `${governedDomain} domain work should be assigned to ${expectedRole}; received ${input.assignedRole}.`;
      if (normalizedDomains.length > 1 && mixedDomainExplicit) warnings.push(`${message} Mixed-domain justification allows a single owner with explicit review/escalation.`);
      else blockReasons.push(message);
    }
  }

  if (normalizedDomains.length > 1 && policy.mixedDomainRules.allowedOnlyWhenExplicit) {
    if (!mixedDomainExplicit) {
      blockReasons.push("mixed-domain work requires explicit escalation, mixed-domain justification, or multi-lane note.");
    } else {
      warnings.push("mixed-domain work is explicitly justified; keep ownership and review checkpoints visible.");
    }
  }

  if (input.workType === "implementation") {
    if ((input.allowedPaths ?? []).length === 0) {
      const message = "implementation domain governance expects allowedPaths to express path ownership boundaries.";
      if (policy.pathOwnershipMode === "blocking") blockReasons.push(message);
      else warnings.push(message);
    }
    if ((input.filesToModify ?? []).length === 0) {
      const message = "implementation domain governance expects filesToModify or a concrete modify scope before worker execution.";
      if (policy.pathOwnershipMode === "blocking") blockReasons.push(message);
      else warnings.push(message);
    }
  }

  return {
    pass: blockReasons.length === 0,
    warnings,
    blockReasons,
    expectedRoleByDomain,
    normalizedDomains,
  };
}
