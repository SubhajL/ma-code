import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TEAM_IDS = ["planning", "build", "quality", "recovery"] as const;
export const DOMAIN_IDS = ["frontend", "backend", "infra", "docs", "research"] as const;
export const WORK_TYPES = ["implementation", "docs_only", "research_only", "review_only", "mixed"] as const;
export const REQUIREMENTS_CLARITY = ["clear", "ambiguous"] as const;
export const SCOPE_CLARITY = ["bounded", "unclear", "moving"] as const;
export const ACCEPTANCE_STATES = ["explicit", "missing"] as const;
export const REPO_IMPACT_STATES = ["known", "unclear"] as const;
export const VALIDATION_STATES = ["not_needed", "needed", "pass", "fail", "contradictory"] as const;
export const PROVIDER_RELIABILITY = ["normal", "unreliable"] as const;
export const BUILD_PARALLELISM = ["single", "multiple"] as const;
export const BUILD_FILES_OVERLAP = ["none", "possible", "unknown"] as const;
export const WORKTREE_ISOLATION = ["available", "unavailable"] as const;

export type TeamId = (typeof TEAM_IDS)[number];
export type DomainId = (typeof DOMAIN_IDS)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type RequirementsClarity = (typeof REQUIREMENTS_CLARITY)[number];
export type ScopeClarity = (typeof SCOPE_CLARITY)[number];
export type AcceptanceCriteriaState = (typeof ACCEPTANCE_STATES)[number];
export type RepoImpactState = (typeof REPO_IMPACT_STATES)[number];
export type ValidationState = (typeof VALIDATION_STATES)[number];
export type ProviderReliability = (typeof PROVIDER_RELIABILITY)[number];
export type BuildParallelism = (typeof BUILD_PARALLELISM)[number];
export type BuildFilesOverlap = (typeof BUILD_FILES_OVERLAP)[number];
export type WorktreeIsolation = (typeof WORKTREE_ISOLATION)[number];

export interface TeamDefinition {
  name: TeamId;
  lead: string;
  workers: string[];
  when_to_use: string[];
  notes: string[];
}

export interface ActivationDefaults {
  quality_waits_for_all_builders: boolean;
  light_quality_for_non_mutating_work: boolean;
  recovery_stops_normal_flow: boolean;
}

export interface PlanningTriggers {
  human_asked_for_design: boolean;
  requirements_clarity: RequirementsClarity[];
  scope_clarity: ScopeClarity[];
  acceptance_criteria: AcceptanceCriteriaState[];
  repo_impact: RepoImpactState[];
  multi_domain_threshold: number;
}

export interface BuildTriggers {
  work_types: WorkType[];
  scope_clarity: ScopeClarity[];
  acceptance_criteria: AcceptanceCriteriaState[];
}

export interface QualityTriggers {
  work_types: WorkType[];
  activate_on_code_or_config_changed: boolean;
  activate_on_validation_states: ValidationState[];
  light_for_work_types: WorkType[];
}

export interface RecoveryTriggers {
  validation_states: ValidationState[];
  blocked_count_gte: number;
  provider_reliability: ProviderReliability[];
}

export interface PlanningBuildRequiresRule {
  scope_clarity: ScopeClarity[];
  requirements_clarity: RequirementsClarity[];
  acceptance_criteria: AcceptanceCriteriaState[];
  repo_impact: RepoImpactState[];
}

export interface MultipleBuildWorkersRule {
  build_files_overlap: BuildFilesOverlap[];
  worktree_isolation: WorktreeIsolation[];
}

export interface OverlapRules {
  planning_build_requires: PlanningBuildRequiresRule;
  multiple_build_workers_allow_when: MultipleBuildWorkersRule;
  quality_build_requires_early_checkpoint: boolean;
  recovery_parallel_allowed: boolean;
}

export interface SequenceDefaults {
  planning_then: TeamId[];
  build_then: TeamId[];
  quality_then: TeamId[];
  recovery_then: TeamId[];
}

export interface TeamActivationPolicy {
  notes: string[];
  activation_defaults: ActivationDefaults;
  planning_triggers: PlanningTriggers;
  build_triggers: BuildTriggers;
  quality_triggers: QualityTriggers;
  recovery_triggers: RecoveryTriggers;
  overlap_rules: OverlapRules;
  sequence_defaults: SequenceDefaults;
}

export interface TeamActivationInput {
  workType?: WorkType;
  requirementsClarity?: RequirementsClarity;
  scopeClarity?: ScopeClarity;
  acceptanceCriteria?: AcceptanceCriteriaState;
  repoImpact?: RepoImpactState;
  domains?: DomainId[];
  humanAskedForDesign?: boolean;
  codeOrConfigChanged?: boolean;
  validationState?: ValidationState;
  blockedCount?: number;
  providerReliability?: ProviderReliability;
  buildParallelism?: BuildParallelism;
  buildFilesOverlap?: BuildFilesOverlap;
  worktreeIsolation?: WorktreeIsolation;
  earlyQualityCheckpoint?: boolean;
}

export interface ActivationDecision {
  team: TeamId;
  lead: string;
  workers: string[];
  reason: string;
}

export interface SkipDecision {
  team: TeamId;
  reason: string;
}

export interface OverlapDecision {
  allowed: boolean;
  reason: string;
}

export interface TeamActivationResolution {
  initialTeam: TeamId;
  sequence: TeamId[];
  activatedTeams: ActivationDecision[];
  skippedTeams: SkipDecision[];
  qualityMode: "full" | "light" | "none";
  qualityWaitsForBuildCompletion: boolean;
  overlapDecisions: {
    planningBuild: OverlapDecision;
    multipleBuildWorkers: OverlapDecision;
    qualityBuild: OverlapDecision;
    recoveryWithOthers: OverlapDecision;
  };
  inputSummary: Required<TeamActivationInput>;
  policyNotes: string[];
}

const POLICY_PATH = ".pi/agent/teams/activation-policy.json";
const TEAM_FILE_PATHS: Record<TeamId, string> = {
  planning: ".pi/agent/teams/planning.yaml",
  build: ".pi/agent/teams/build.yaml",
  quality: ".pi/agent/teams/quality.yaml",
  recovery: ".pi/agent/teams/recovery.yaml",
};

const ResolveTeamActivationSchema = Type.Object({
  workType: Type.Optional(StringEnum(WORK_TYPES)),
  requirementsClarity: Type.Optional(StringEnum(REQUIREMENTS_CLARITY)),
  scopeClarity: Type.Optional(StringEnum(SCOPE_CLARITY)),
  acceptanceCriteria: Type.Optional(StringEnum(ACCEPTANCE_STATES)),
  repoImpact: Type.Optional(StringEnum(REPO_IMPACT_STATES)),
  domains: Type.Optional(Type.Array(StringEnum(DOMAIN_IDS))),
  humanAskedForDesign: Type.Optional(Type.Boolean()),
  codeOrConfigChanged: Type.Optional(Type.Boolean()),
  validationState: Type.Optional(StringEnum(VALIDATION_STATES)),
  blockedCount: Type.Optional(Type.Integer({ minimum: 0 })),
  providerReliability: Type.Optional(StringEnum(PROVIDER_RELIABILITY)),
  buildParallelism: Type.Optional(StringEnum(BUILD_PARALLELISM)),
  buildFilesOverlap: Type.Optional(StringEnum(BUILD_FILES_OVERLAP)),
  worktreeIsolation: Type.Optional(StringEnum(WORKTREE_ISOLATION)),
  earlyQualityCheckpoint: Type.Optional(Type.Boolean()),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : [];
}

function parseEnumArray<T extends string>(raw: unknown, allowed: readonly T[], fieldName: string): T[] {
  const values = parseStringArray(raw).filter((value): value is T => allowed.includes(value as T));
  if (values.length === 0) {
    throw new Error(`${fieldName} must contain at least one allowed value.`);
  }
  return values;
}

function parseBoolean(raw: unknown, fieldName: string): boolean {
  if (typeof raw !== "boolean") {
    throw new Error(`${fieldName} must be a boolean.`);
  }
  return raw;
}

function parseInteger(raw: unknown, fieldName: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new Error(`${fieldName} must be an integer.`);
  }
  return raw;
}

export function parseTeamDefinition(raw: string, expectedName?: TeamId): TeamDefinition {
  const scalars: Record<string, string> = {};
  const lists: Record<string, string[]> = {
    workers: [],
    when_to_use: [],
    notes: [],
  };
  let activeList: keyof typeof lists | null = null;

  for (const originalLine of raw.split(/\r?\n/)) {
    const trimmedLine = originalLine.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const listMatch = trimmedLine.match(/^-\s+(.*)$/);
    if (listMatch) {
      if (!activeList) {
        throw new Error(`List item encountered before list key: ${trimmedLine}`);
      }
      lists[activeList].push(listMatch[1].trim());
      continue;
    }

    const keyMatch = trimmedLine.match(/^([a-zA-Z_]+):(?:\s*(.*))?$/);
    if (!keyMatch) {
      throw new Error(`Unsupported YAML line: ${trimmedLine}`);
    }

    const [, key, value = ""] = keyMatch;
    if (key in lists) {
      activeList = key as keyof typeof lists;
      if (value.trim()) {
        lists[activeList].push(value.trim());
      }
    } else {
      activeList = null;
      scalars[key] = value.trim();
    }
  }

  const parsedName = scalars.name as TeamId | undefined;
  const name = parsedName && TEAM_IDS.includes(parsedName) ? parsedName : expectedName;
  if (!name) {
    throw new Error(`Team definition is missing a valid name.`);
  }
  if (!scalars.lead) {
    throw new Error(`Team definition ${name} is missing lead.`);
  }

  return {
    name,
    lead: scalars.lead,
    workers: uniqueStrings(lists.workers),
    when_to_use: uniqueStrings(lists.when_to_use),
    notes: uniqueStrings(lists.notes),
  };
}

export function parseActivationPolicy(raw: unknown): TeamActivationPolicy {
  if (!isRecord(raw)) {
    throw new Error("Activation policy must be an object.");
  }

  const defaultsRaw = raw.activation_defaults;
  const planningRaw = raw.planning_triggers;
  const buildRaw = raw.build_triggers;
  const qualityRaw = raw.quality_triggers;
  const recoveryRaw = raw.recovery_triggers;
  const overlapRaw = raw.overlap_rules;
  const sequenceRaw = raw.sequence_defaults;

  if (!isRecord(defaultsRaw) || !isRecord(planningRaw) || !isRecord(buildRaw) || !isRecord(qualityRaw) || !isRecord(recoveryRaw) || !isRecord(overlapRaw) || !isRecord(sequenceRaw)) {
    throw new Error("Activation policy is missing required top-level sections.");
  }

  const planningBuildRequiresRaw = overlapRaw.planning_build_requires;
  const multipleBuildWorkersRaw = overlapRaw.multiple_build_workers_allow_when;
  if (!isRecord(planningBuildRequiresRaw) || !isRecord(multipleBuildWorkersRaw)) {
    throw new Error("overlap_rules is missing required nested sections.");
  }

  return {
    notes: parseStringArray(raw.notes),
    activation_defaults: {
      quality_waits_for_all_builders: parseBoolean(defaultsRaw.quality_waits_for_all_builders, "activation_defaults.quality_waits_for_all_builders"),
      light_quality_for_non_mutating_work: parseBoolean(defaultsRaw.light_quality_for_non_mutating_work, "activation_defaults.light_quality_for_non_mutating_work"),
      recovery_stops_normal_flow: parseBoolean(defaultsRaw.recovery_stops_normal_flow, "activation_defaults.recovery_stops_normal_flow"),
    },
    planning_triggers: {
      human_asked_for_design: parseBoolean(planningRaw.human_asked_for_design, "planning_triggers.human_asked_for_design"),
      requirements_clarity: parseEnumArray(planningRaw.requirements_clarity, REQUIREMENTS_CLARITY, "planning_triggers.requirements_clarity"),
      scope_clarity: parseEnumArray(planningRaw.scope_clarity, SCOPE_CLARITY, "planning_triggers.scope_clarity"),
      acceptance_criteria: parseEnumArray(planningRaw.acceptance_criteria, ACCEPTANCE_STATES, "planning_triggers.acceptance_criteria"),
      repo_impact: parseEnumArray(planningRaw.repo_impact, REPO_IMPACT_STATES, "planning_triggers.repo_impact"),
      multi_domain_threshold: parseInteger(planningRaw.multi_domain_threshold, "planning_triggers.multi_domain_threshold"),
    },
    build_triggers: {
      work_types: parseEnumArray(buildRaw.work_types, WORK_TYPES, "build_triggers.work_types"),
      scope_clarity: parseEnumArray(buildRaw.scope_clarity, SCOPE_CLARITY, "build_triggers.scope_clarity"),
      acceptance_criteria: parseEnumArray(buildRaw.acceptance_criteria, ACCEPTANCE_STATES, "build_triggers.acceptance_criteria"),
    },
    quality_triggers: {
      work_types: parseEnumArray(qualityRaw.work_types, WORK_TYPES, "quality_triggers.work_types"),
      activate_on_code_or_config_changed: parseBoolean(qualityRaw.activate_on_code_or_config_changed, "quality_triggers.activate_on_code_or_config_changed"),
      activate_on_validation_states: parseEnumArray(qualityRaw.activate_on_validation_states, VALIDATION_STATES, "quality_triggers.activate_on_validation_states"),
      light_for_work_types: parseEnumArray(qualityRaw.light_for_work_types, WORK_TYPES, "quality_triggers.light_for_work_types"),
    },
    recovery_triggers: {
      validation_states: parseEnumArray(recoveryRaw.validation_states, VALIDATION_STATES, "recovery_triggers.validation_states"),
      blocked_count_gte: parseInteger(recoveryRaw.blocked_count_gte, "recovery_triggers.blocked_count_gte"),
      provider_reliability: parseEnumArray(recoveryRaw.provider_reliability, PROVIDER_RELIABILITY, "recovery_triggers.provider_reliability"),
    },
    overlap_rules: {
      planning_build_requires: {
        scope_clarity: parseEnumArray(planningBuildRequiresRaw.scope_clarity, SCOPE_CLARITY, "overlap_rules.planning_build_requires.scope_clarity"),
        requirements_clarity: parseEnumArray(planningBuildRequiresRaw.requirements_clarity, REQUIREMENTS_CLARITY, "overlap_rules.planning_build_requires.requirements_clarity"),
        acceptance_criteria: parseEnumArray(planningBuildRequiresRaw.acceptance_criteria, ACCEPTANCE_STATES, "overlap_rules.planning_build_requires.acceptance_criteria"),
        repo_impact: parseEnumArray(planningBuildRequiresRaw.repo_impact, REPO_IMPACT_STATES, "overlap_rules.planning_build_requires.repo_impact"),
      },
      multiple_build_workers_allow_when: {
        build_files_overlap: parseEnumArray(multipleBuildWorkersRaw.build_files_overlap, BUILD_FILES_OVERLAP, "overlap_rules.multiple_build_workers_allow_when.build_files_overlap"),
        worktree_isolation: parseEnumArray(multipleBuildWorkersRaw.worktree_isolation, WORKTREE_ISOLATION, "overlap_rules.multiple_build_workers_allow_when.worktree_isolation"),
      },
      quality_build_requires_early_checkpoint: parseBoolean(overlapRaw.quality_build_requires_early_checkpoint, "overlap_rules.quality_build_requires_early_checkpoint"),
      recovery_parallel_allowed: parseBoolean(overlapRaw.recovery_parallel_allowed, "overlap_rules.recovery_parallel_allowed"),
    },
    sequence_defaults: {
      planning_then: parseEnumArray(sequenceRaw.planning_then, TEAM_IDS, "sequence_defaults.planning_then"),
      build_then: parseEnumArray(sequenceRaw.build_then, TEAM_IDS, "sequence_defaults.build_then"),
      quality_then: Array.isArray(sequenceRaw.quality_then) ? parseStringArray(sequenceRaw.quality_then).filter((value): value is TeamId => TEAM_IDS.includes(value as TeamId)) : [],
      recovery_then: Array.isArray(sequenceRaw.recovery_then) ? parseStringArray(sequenceRaw.recovery_then).filter((value): value is TeamId => TEAM_IDS.includes(value as TeamId)) : [],
    },
  };
}

export async function loadActivationPolicy(cwd: string): Promise<TeamActivationPolicy> {
  const raw = await readFile(resolve(cwd, POLICY_PATH), "utf8");
  return parseActivationPolicy(JSON.parse(raw));
}

export async function loadTeamDefinitions(cwd: string): Promise<Record<TeamId, TeamDefinition>> {
  const entries = await Promise.all(
    TEAM_IDS.map(async (teamId) => {
      const raw = await readFile(resolve(cwd, TEAM_FILE_PATHS[teamId]), "utf8");
      return [teamId, parseTeamDefinition(raw, teamId)] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<TeamId, TeamDefinition>;
}

export function withActivationInputDefaults(input: TeamActivationInput): Required<TeamActivationInput> {
  return {
    workType: input.workType ?? "mixed",
    requirementsClarity: input.requirementsClarity ?? "ambiguous",
    scopeClarity: input.scopeClarity ?? "unclear",
    acceptanceCriteria: input.acceptanceCriteria ?? "missing",
    repoImpact: input.repoImpact ?? "unclear",
    domains: uniqueStrings((input.domains ?? []) as string[]).filter((value): value is DomainId => DOMAIN_IDS.includes(value as DomainId)),
    humanAskedForDesign: input.humanAskedForDesign ?? false,
    codeOrConfigChanged: input.codeOrConfigChanged ?? false,
    validationState: input.validationState ?? "not_needed",
    blockedCount: input.blockedCount ?? 0,
    providerReliability: input.providerReliability ?? "normal",
    buildParallelism: input.buildParallelism ?? "single",
    buildFilesOverlap: input.buildFilesOverlap ?? "unknown",
    worktreeIsolation: input.worktreeIsolation ?? "unavailable",
    earlyQualityCheckpoint: input.earlyQualityCheckpoint ?? false,
  };
}

function includesValue<T extends string>(list: readonly T[], value: T): boolean {
  return list.includes(value);
}

function addUniqueTeam(sequence: TeamId[], team: TeamId): void {
  if (!sequence.includes(team)) {
    sequence.push(team);
  }
}

export function resolveTeamActivation(
  policy: TeamActivationPolicy,
  teams: Record<TeamId, TeamDefinition>,
  rawInput: TeamActivationInput,
): TeamActivationResolution {
  const input = withActivationInputDefaults(rawInput);
  const domainCount = uniqueStrings(input.domains).length;
  const buildCapableWork = includesValue(policy.build_triggers.work_types, input.workType);
  const buildReady =
    buildCapableWork &&
    includesValue(policy.build_triggers.scope_clarity, input.scopeClarity) &&
    includesValue(policy.build_triggers.acceptance_criteria, input.acceptanceCriteria);

  const planningNeeded =
    (policy.planning_triggers.human_asked_for_design && input.humanAskedForDesign) ||
    includesValue(policy.planning_triggers.requirements_clarity, input.requirementsClarity) ||
    includesValue(policy.planning_triggers.scope_clarity, input.scopeClarity) ||
    includesValue(policy.planning_triggers.acceptance_criteria, input.acceptanceCriteria) ||
    includesValue(policy.planning_triggers.repo_impact, input.repoImpact) ||
    domainCount >= policy.planning_triggers.multi_domain_threshold ||
    (buildCapableWork && !buildReady);

  const qualityTriggeredByWorkType = includesValue(policy.quality_triggers.work_types, input.workType);
  const qualityTriggeredByValidation = includesValue(policy.quality_triggers.activate_on_validation_states, input.validationState);
  const qualityTriggeredByChange = policy.quality_triggers.activate_on_code_or_config_changed && input.codeOrConfigChanged;
  const qualityNeeded = qualityTriggeredByWorkType || qualityTriggeredByValidation || qualityTriggeredByChange;

  const recoveryNeeded =
    includesValue(policy.recovery_triggers.validation_states, input.validationState) ||
    input.blockedCount >= policy.recovery_triggers.blocked_count_gte ||
    includesValue(policy.recovery_triggers.provider_reliability, input.providerReliability);

  const qualityModeCandidate: Exclude<TeamActivationResolution["qualityMode"], "none"> =
    policy.activation_defaults.light_quality_for_non_mutating_work &&
    includesValue(policy.quality_triggers.light_for_work_types, input.workType) &&
    !input.codeOrConfigChanged
      ? "light"
      : "full";

  const planningBuildAllowed =
    planningNeeded &&
    buildReady &&
    !input.humanAskedForDesign &&
    includesValue(policy.overlap_rules.planning_build_requires.scope_clarity, input.scopeClarity) &&
    includesValue(policy.overlap_rules.planning_build_requires.requirements_clarity, input.requirementsClarity) &&
    includesValue(policy.overlap_rules.planning_build_requires.acceptance_criteria, input.acceptanceCriteria) &&
    includesValue(policy.overlap_rules.planning_build_requires.repo_impact, input.repoImpact);

  const multipleBuildWorkersAllowed =
    input.buildParallelism === "multiple" &&
    (includesValue(policy.overlap_rules.multiple_build_workers_allow_when.build_files_overlap, input.buildFilesOverlap) ||
      includesValue(policy.overlap_rules.multiple_build_workers_allow_when.worktree_isolation, input.worktreeIsolation)) &&
    input.scopeClarity === "bounded";

  const qualityBuildAllowed = input.earlyQualityCheckpoint && policy.overlap_rules.quality_build_requires_early_checkpoint;
  const recoveryWithOthersAllowed = policy.overlap_rules.recovery_parallel_allowed;

  const qualityWaitsForBuildCompletion =
    input.buildParallelism === "multiple"
      ? policy.activation_defaults.quality_waits_for_all_builders && !qualityBuildAllowed
      : true;

  const sequence: TeamId[] = [];
  const policyNotes = [...policy.notes];

  if (recoveryNeeded && policy.activation_defaults.recovery_stops_normal_flow) {
    sequence.push("recovery");
    policyNotes.push("Recovery stops normal flow until retry, reroute, rollback, stop, or escalation is decided.");
  } else {
    if (planningNeeded) {
      sequence.push("planning");
      if (buildReady) {
        for (const team of policy.sequence_defaults.planning_then) addUniqueTeam(sequence, team);
      } else if (buildCapableWork) {
        policyNotes.push("Build-capable work was held behind planning because execution was not yet bounded.");
      }
    } else if (buildReady) {
      sequence.push("build");
      for (const team of policy.sequence_defaults.build_then) addUniqueTeam(sequence, team);
    } else if (qualityNeeded) {
      sequence.push("quality");
      for (const team of policy.sequence_defaults.quality_then) addUniqueTeam(sequence, team);
    }

    if (
      qualityNeeded &&
      !sequence.includes("quality") &&
      (sequence.includes("build") ||
        input.workType === "review_only" ||
        qualityTriggeredByValidation ||
        qualityTriggeredByChange)
    ) {
      sequence.push("quality");
    }

    if (sequence.length === 0) {
      sequence.push("planning");
      policyNotes.push("Fell back to planning because no bounded build, quality, or recovery path was confidently activatable.");
    }
  }

  const qualityMode: TeamActivationResolution["qualityMode"] = sequence.includes("quality") ? qualityModeCandidate : "none";

  const initialTeam = sequence[0];
  const activatedTeams = sequence.map((team) => ({
    team,
    lead: teams[team].lead,
    workers: teams[team].workers,
    reason:
      team === "planning"
        ? planningNeeded
          ? "Material uncertainty or unbounded implementation conditions require planning first."
          : "Fallback planning lane selected because no other bounded start was safe."
        : team === "build"
          ? "Implementation-ready work is bounded enough to execute."
          : team === "quality"
            ? qualityMode === "light"
              ? "Quality is activated in light mode for non-mutating work that still needs evidence."
              : "Quality is activated because review/validation evidence is required before completion."
            : "Recovery is activated because failure, contradiction, repeated blockage, or provider unreliability was detected.",
  }));

  const skippedTeams: SkipDecision[] = TEAM_IDS.filter((team) => !sequence.includes(team)).map((team) => {
    const reason =
      team === "planning"
        ? "Planning was skipped because the work was already bounded enough for direct execution or recovery took priority."
        : team === "build"
          ? buildCapableWork && !buildReady
            ? "Build was skipped because execution was not yet bounded enough to start safely."
            : "Build was skipped because no implementation-ready work was identified in this activation pass."
          : team === "quality"
            ? "Quality was skipped because this activation pass did not yet require review/validation packaging."
            : recoveryNeeded
              ? "Recovery is already the active lane; parallel recovery is not allowed."
              : "Recovery was skipped because no failure, contradiction, or repeated blockage trigger was present.";
    return { team, reason };
  });

  if (planningBuildAllowed) {
    policyNotes.push("Planning/build minimal overlap is allowed because the bounded first implementation slice is already stable enough.");
  }
  if (multipleBuildWorkersAllowed) {
    policyNotes.push("Multiple build workers are allowed because file/domain boundaries are non-overlapping or worktree isolation exists.");
  }
  if (qualityBuildAllowed) {
    policyNotes.push("Quality/build overlap is allowed for an early checkpoint requested by the build lead.");
  }

  return {
    initialTeam,
    sequence,
    activatedTeams,
    skippedTeams,
    qualityMode,
    qualityWaitsForBuildCompletion,
    overlapDecisions: {
      planningBuild: {
        allowed: planningBuildAllowed,
        reason: planningBuildAllowed
          ? "Minimal planning/build overlap is allowed because execution is already bounded and stable enough for a first slice."
          : "Planning/build overlap is not allowed by default; planning should finish a usable packet before build starts.",
      },
      multipleBuildWorkers: {
        allowed: multipleBuildWorkersAllowed,
        reason: multipleBuildWorkersAllowed
          ? "Multiple build workers are allowed because file/domain boundaries are non-overlapping or explicit worktree isolation exists."
          : "Multiple build workers are not allowed because overlap risk or missing isolation would make ownership unclear.",
      },
      qualityBuild: {
        allowed: qualityBuildAllowed,
        reason: qualityBuildAllowed
          ? "Quality may overlap with build because an early checkpoint was explicitly requested."
          : "Quality should normally evaluate outputs after a bounded implementation packet completes.",
      },
      recoveryWithOthers: {
        allowed: recoveryWithOthersAllowed,
        reason: recoveryWithOthersAllowed
          ? "Recovery parallelism is allowed by policy."
          : "Recovery should decide retry, reroute, rollback, stop, or escalate before concurrent retry work continues.",
      },
    },
    inputSummary: input,
    policyNotes,
  };
}

export default function teamActivation(pi: ExtensionAPI) {
  pi.registerTool({
    name: "resolve_team_activation",
    label: "Resolve Team Activation",
    description: "Resolve deterministic team activation, sequence, and overlap decisions for the repo-local harness.",
    promptSnippet: "Use deterministic team-activation policy instead of improvising which team should act next.",
    promptGuidelines: [
      "Use this tool when planning/build/quality/recovery team choice should follow the repo-local orchestration policy.",
      "Prefer this tool before improvising team sequence, skip rules, overlap rules, or quality wait behavior.",
    ],
    parameters: ResolveTeamActivationSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const [policy, teams] = await Promise.all([loadActivationPolicy(ctx.cwd), loadTeamDefinitions(ctx.cwd)]);
        const result = resolveTeamActivation(policy, teams, params);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: { ok: true, ...result },
        };
      } catch (error) {
        const message = `Team activation resolution failed: ${String(error)}`;
        return {
          content: [{ type: "text", text: message }],
          details: { ok: false, error: String(error) },
        };
      }
    },
  });
}
