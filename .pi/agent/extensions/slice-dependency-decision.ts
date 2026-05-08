export type SliceDependencyBlockerType =
  | "shared_file"
  | "shared_contract"
  | "shared_schema"
  | "shared_config"
  | "shared_test"
  | "same_slice"
  | "missing_proof"
  | "lease_conflict_unknown";

export type SliceParallelismDecisionState = "blocked" | "allowed";
export type SliceRecommendedExecution = "sequential" | "parallel_candidate";

export interface SliceDependencyBlocker {
  type: SliceDependencyBlockerType;
  sliceIds: string[];
  paths: string[];
  reason: string;
}

export interface SliceParallelismProof {
  distinctSlices: boolean;
  disjointFilesToModify: boolean;
  disjointAllowedPaths: boolean;
  disjointContracts: boolean;
  noSharedSchemaOrMigration: boolean;
  noSharedConfig: boolean;
  noSharedTestsOrFixtures: boolean;
  leaseConflictCheckAvailable: boolean;
}

export interface SliceParallelismDecision {
  version: 1;
  sliceIds: string[];
  parallelAllowed: boolean;
  decision: SliceParallelismDecisionState;
  blockers: SliceDependencyBlocker[];
  proof: SliceParallelismProof;
  recommendedExecution: SliceRecommendedExecution;
  notes: string[];
}

export interface SlicePathAccessProof {
  path: string;
  access?: "read_only" | "non_mutating" | "read_write" | "mutating";
  mutating?: boolean;
}

export interface SliceContractReference {
  path?: string;
  hash?: string;
}

export interface SliceDependencySummary {
  sliceId: string;
  filesToModify?: string[];
  allowedPaths?: Array<string | SlicePathAccessProof>;
  contracts?: Array<string | SliceContractReference>;
  contractPaths?: string[];
  contractHashes?: string[];
  schemaPaths?: string[];
  migrationPaths?: string[];
  configPaths?: string[];
  testPaths?: string[];
  fixturePaths?: string[];
  notes?: string[];
}

export interface SliceArtifactReference {
  artifactPath: string;
  summary?: SliceDependencySummary | null;
  missing?: boolean;
  parseError?: string;
}

export interface SliceParallelismInput {
  slices: Array<SliceDependencySummary | SliceArtifactReference | null | undefined>;
  schedulingReadiness?: boolean;
  leaseConflictCheckAvailable?: boolean;
  notes?: string[];
}

interface NormalizedAllowedPath {
  path: string;
  mutating: boolean;
}

interface NormalizedSlice {
  sliceId: string;
  filesToModify?: string[];
  allowedPaths?: NormalizedAllowedPath[];
  contractPaths: string[];
  contractHashes: string[];
  schemaOrMigrationPaths: string[];
  configPaths: string[];
  testOrFixturePaths: string[];
  notes: string[];
}

interface MissingSliceArtifact {
  artifactPath?: string;
  reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(pathValue: string): string {
  return pathValue.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function normalizePathArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  return unique(values.filter((value): value is string => typeof value === "string").map(normalizePath).filter(Boolean));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeAllowedPaths(values: SliceDependencySummary["allowedPaths"]): NormalizedAllowedPath[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const paths: NormalizedAllowedPath[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      const path = normalizePath(value);
      if (path) paths.push({ path, mutating: true });
      continue;
    }
    if (!isRecord(value) || typeof value.path !== "string") continue;
    const path = normalizePath(value.path);
    if (!path) continue;
    const access = typeof value.access === "string" ? value.access : undefined;
    const mutating = typeof value.mutating === "boolean" ? value.mutating : access !== "read_only" && access !== "non_mutating";
    paths.push({ path, mutating });
  }
  const byPath = new Map<string, NormalizedAllowedPath>();
  for (const entry of paths) {
    const existing = byPath.get(entry.path);
    byPath.set(entry.path, { path: entry.path, mutating: (existing?.mutating ?? false) || entry.mutating });
  }
  return [...byPath.values()];
}

function normalizeContractReferences(summary: SliceDependencySummary): Pick<NormalizedSlice, "contractPaths" | "contractHashes"> {
  const contractPaths: string[] = [];
  const contractHashes: string[] = [];
  for (const pathValue of normalizePathArray(summary.contractPaths) ?? []) contractPaths.push(pathValue);
  for (const hashValue of normalizePathArray(summary.contractHashes) ?? []) contractHashes.push(hashValue);
  if (Array.isArray(summary.contracts)) {
    for (const contract of summary.contracts) {
      if (typeof contract === "string") {
        const path = normalizePath(contract);
        if (path) contractPaths.push(path);
        continue;
      }
      if (!isRecord(contract)) continue;
      if (typeof contract.path === "string") {
        const path = normalizePath(contract.path);
        if (path) contractPaths.push(path);
      }
      if (typeof contract.hash === "string") {
        const hash = contract.hash.trim();
        if (hash) contractHashes.push(hash);
      }
    }
  }
  return { contractPaths: unique(contractPaths), contractHashes: unique(contractHashes) };
}

function normalizeSlice(summary: SliceDependencySummary): NormalizedSlice {
  const contracts = normalizeContractReferences(summary);
  return {
    sliceId: summary.sliceId.trim(),
    filesToModify: normalizePathArray(summary.filesToModify),
    allowedPaths: normalizeAllowedPaths(summary.allowedPaths),
    contractPaths: contracts.contractPaths,
    contractHashes: contracts.contractHashes,
    schemaOrMigrationPaths: unique([
      ...(normalizePathArray(summary.schemaPaths) ?? []),
      ...(normalizePathArray(summary.migrationPaths) ?? []),
    ]),
    configPaths: normalizePathArray(summary.configPaths) ?? [],
    testOrFixturePaths: unique([
      ...(normalizePathArray(summary.testPaths) ?? []),
      ...(normalizePathArray(summary.fixturePaths) ?? []),
    ]),
    notes: Array.isArray(summary.notes) ? summary.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0) : [],
  };
}

function unwrapEntry(entry: SliceParallelismInput["slices"][number]): SliceDependencySummary | MissingSliceArtifact {
  if (!entry) return { reason: "Missing slice artifact." };
  if ("artifactPath" in entry) {
    if (entry.missing === true) return { artifactPath: entry.artifactPath, reason: `Missing slice artifact: ${entry.artifactPath}.` };
    if (typeof entry.parseError === "string" && entry.parseError.trim().length > 0) {
      return { artifactPath: entry.artifactPath, reason: `Malformed slice artifact ${entry.artifactPath}: ${entry.parseError}` };
    }
    if (!entry.summary) return { artifactPath: entry.artifactPath, reason: `Missing slice artifact summary: ${entry.artifactPath}.` };
    return entry.summary;
  }
  return entry;
}

function pairwise<T>(items: T[], visit: (left: T, right: T) => void): void {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) visit(items[i], items[j]);
  }
}

function pathsOverlap(left: string, right: string): boolean {
  if (left === right) return true;
  return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function sharedPaths(left: string[], right: string[]): string[] {
  const matches: string[] = [];
  for (const leftPath of left) {
    for (const rightPath of right) {
      if (pathsOverlap(leftPath, rightPath)) matches.push(leftPath === rightPath ? leftPath : `${leftPath} ↔ ${rightPath}`);
    }
  }
  return unique(matches);
}

function sharedAllowedPaths(left: NormalizedAllowedPath[], right: NormalizedAllowedPath[]): string[] {
  const matches: string[] = [];
  for (const leftPath of left) {
    for (const rightPath of right) {
      if (leftPath.mutating && rightPath.mutating && pathsOverlap(leftPath.path, rightPath.path)) {
        matches.push(leftPath.path === rightPath.path ? leftPath.path : `${leftPath.path} ↔ ${rightPath.path}`);
      }
    }
  }
  return unique(matches);
}

function pushBlocker(blockers: SliceDependencyBlocker[], type: SliceDependencyBlockerType, sliceIds: string[], paths: string[], reason: string): void {
  blockers.push({ type, sliceIds: unique(sliceIds), paths: unique(paths), reason });
}

function missingProofBlockers(slices: NormalizedSlice[], missingArtifacts: MissingSliceArtifact[]): SliceDependencyBlocker[] {
  const blockers: SliceDependencyBlocker[] = [];
  for (const artifact of missingArtifacts) {
    pushBlocker(blockers, "missing_proof", [], artifact.artifactPath ? [artifact.artifactPath] : [], artifact.reason);
  }
  for (const slice of slices) {
    if (!slice.sliceId) {
      pushBlocker(blockers, "missing_proof", [], [], "Missing sliceId proof.");
      continue;
    }
    if (!slice.filesToModify) {
      pushBlocker(blockers, "missing_proof", [slice.sliceId], [], `Missing filesToModify proof for ${slice.sliceId}.`);
    }
    if (!slice.allowedPaths) {
      pushBlocker(blockers, "missing_proof", [slice.sliceId], [], `Missing allowedPaths proof for ${slice.sliceId}.`);
    }
  }
  return blockers;
}

export function decideSliceParallelism(input: SliceParallelismInput): SliceParallelismDecision {
  const notes = Array.isArray(input.notes) ? input.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0) : [];
  const missingArtifacts: MissingSliceArtifact[] = [];
  const slices: NormalizedSlice[] = [];

  for (const entry of input.slices) {
    const unwrapped = unwrapEntry(entry);
    if ("reason" in unwrapped) {
      missingArtifacts.push(unwrapped);
      continue;
    }
    slices.push(normalizeSlice(unwrapped));
  }

  const blockers: SliceDependencyBlocker[] = missingProofBlockers(slices, missingArtifacts);
  if (slices.length + missingArtifacts.length < 2) {
    pushBlocker(blockers, "missing_proof", slices.map((slice) => slice.sliceId).filter(Boolean), [], "At least two slice artifacts are required to decide cross-slice parallelism.");
  }

  pairwise(slices, (left, right) => {
    if (left.sliceId === right.sliceId) {
      pushBlocker(blockers, "same_slice", [left.sliceId], [], `Same-slice comparison is not parallel-safe: ${left.sliceId}.`);
    }

    if (left.filesToModify && right.filesToModify) {
      const paths = sharedPaths(left.filesToModify, right.filesToModify);
      if (paths.length > 0) pushBlocker(blockers, "shared_file", [left.sliceId, right.sliceId], paths, "Slices share filesToModify paths.");
    }

    if (left.allowedPaths && right.allowedPaths) {
      const paths = sharedAllowedPaths(left.allowedPaths, right.allowedPaths);
      if (paths.length > 0) pushBlocker(blockers, "shared_file", [left.sliceId, right.sliceId], paths, "Slices have overlapping mutating allowedPaths.");
    }

    const sharedContractPaths = sharedPaths(left.contractPaths, right.contractPaths);
    const sharedContractHashes = left.contractHashes.filter((hash) => right.contractHashes.includes(hash));
    if (sharedContractPaths.length > 0 || sharedContractHashes.length > 0) {
      pushBlocker(blockers, "shared_contract", [left.sliceId, right.sliceId], [...sharedContractPaths, ...sharedContractHashes.map((hash) => `hash:${hash}`)], "Slices share contract path or hash proof.");
    }

    const sharedSchemaPaths = sharedPaths(left.schemaOrMigrationPaths, right.schemaOrMigrationPaths);
    if (sharedSchemaPaths.length > 0) pushBlocker(blockers, "shared_schema", [left.sliceId, right.sliceId], sharedSchemaPaths, "Slices share schema or migration paths.");

    const sharedConfigPaths = sharedPaths(left.configPaths, right.configPaths);
    if (sharedConfigPaths.length > 0) pushBlocker(blockers, "shared_config", [left.sliceId, right.sliceId], sharedConfigPaths, "Slices share config paths.");

    const sharedTestPaths = sharedPaths(left.testOrFixturePaths, right.testOrFixturePaths);
    if (sharedTestPaths.length > 0) pushBlocker(blockers, "shared_test", [left.sliceId, right.sliceId], sharedTestPaths, "Slices share test or fixture paths.");
  });

  const leaseConflictCheckAvailable = input.schedulingReadiness === true ? input.leaseConflictCheckAvailable === true : input.leaseConflictCheckAvailable === true;
  if (input.schedulingReadiness === true && input.leaseConflictCheckAvailable !== true) {
    pushBlocker(blockers, "lease_conflict_unknown", slices.map((slice) => slice.sliceId).filter(Boolean), [], "Lease/worktree conflict check is unavailable for scheduling readiness.");
  }

  const hasBlocker = (type: SliceDependencyBlockerType): boolean => blockers.some((blocker) => blocker.type === type);
  const hasFilesToModifyOverlap = blockers.some((blocker) => blocker.type === "shared_file" && blocker.reason.includes("filesToModify"));
  const hasAllowedPathOverlap = blockers.some((blocker) => blocker.type === "shared_file" && blocker.reason.includes("allowedPaths"));
  const proof: SliceParallelismProof = {
    distinctSlices: slices.length >= 2 && missingArtifacts.length === 0 && !hasBlocker("same_slice") && slices.every((slice) => slice.sliceId.length > 0),
    disjointFilesToModify: !hasFilesToModifyOverlap && slices.every((slice) => Array.isArray(slice.filesToModify)),
    disjointAllowedPaths: !hasAllowedPathOverlap && slices.every((slice) => Array.isArray(slice.allowedPaths)),
    disjointContracts: !hasBlocker("shared_contract"),
    noSharedSchemaOrMigration: !hasBlocker("shared_schema"),
    noSharedConfig: !hasBlocker("shared_config"),
    noSharedTestsOrFixtures: !hasBlocker("shared_test"),
    leaseConflictCheckAvailable,
  };

  const parallelAllowed = blockers.length === 0;
  return {
    version: 1,
    sliceIds: unique(slices.map((slice) => slice.sliceId).filter(Boolean)),
    parallelAllowed,
    decision: parallelAllowed ? "allowed" : "blocked",
    blockers,
    proof,
    recommendedExecution: parallelAllowed ? "parallel_candidate" : "sequential",
    notes: unique([...notes, ...slices.flatMap((slice) => slice.notes)]),
  };
}
