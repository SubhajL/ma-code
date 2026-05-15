export const VALID_DOMAINS = ["frontend", "backend", "infra", "docs", "research"] as const;
export type ValidDomain = (typeof VALID_DOMAINS)[number];

export const DOMAIN_OWNERSHIP_PRIORITY = ["backend", "infra", "frontend", "docs", "research"] as const satisfies readonly ValidDomain[];

export type DomainWorkerRole =
  | "frontend_worker"
  | "backend_worker"
  | "infra_worker"
  | "docs_worker"
  | "research_worker";

export interface DomainOwnershipRecord {
  mode: "single_domain" | "mixed_domain";
  owningDomain: ValidDomain;
  owningRole: DomainWorkerRole;
  supportingDomains: ValidDomain[];
}

export interface DerivedDomainOwnership {
  assignedRole: DomainWorkerRole;
  domainOwnership: DomainOwnershipRecord;
}

function normalizeStringArray(values: string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function isValidDomain(value: string): value is ValidDomain {
  return (VALID_DOMAINS as readonly string[]).includes(value);
}

function assignedRoleForOwnedDomain(domain: ValidDomain): DomainWorkerRole {
  if (domain === "frontend") return "frontend_worker";
  if (domain === "backend") return "backend_worker";
  if (domain === "infra") return "infra_worker";
  if (domain === "docs") return "docs_worker";
  return "research_worker";
}

export function deriveDomainOwnershipForDomains(domains: string[]): DerivedDomainOwnership {
  const normalized = normalizeStringArray(domains).filter(isValidDomain);
  const owningDomain = DOMAIN_OWNERSHIP_PRIORITY.find((domain) => normalized.includes(domain)) ?? normalized[0] ?? "backend";
  const assignedRole = assignedRoleForOwnedDomain(owningDomain);
  const supportingDomains = normalized.filter((domain) => domain !== owningDomain);

  return {
    assignedRole,
    domainOwnership: {
      mode: supportingDomains.length > 0 ? "mixed_domain" : "single_domain",
      owningDomain,
      owningRole: assignedRole,
      supportingDomains,
    },
  };
}

// Helper-only module: export a no-op factory so directory autoload treats this as a valid extension.
export default function domainOwnershipExtension(): void {}
