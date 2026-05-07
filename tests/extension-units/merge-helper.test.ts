import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MERGE_RELEASE_POLICY,
  assessMergeReadiness,
  normalizeMergeMethod,
  parseMergeReleasePolicy,
  type MergePrDetails,
  type MergeRepoState,
} from "../../scripts/harness-merge.ts";

const readyPr: MergePrDetails = {
  number: 101,
  url: "https://github.com/example/repo/pull/101",
  state: "OPEN",
  isDraft: false,
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  reviews: [],
  comments: [],
  headRefName: "feature/ready",
  baseRefName: "main",
};

const cleanRepo: MergeRepoState = {
  repoRoot: "/tmp/repo",
  currentBranch: "main",
  dirtyFiles: [],
};

const passingGate = {
  finalStatus: "pass" as const,
  recommendedNextAction: "merge_or_sync" as const,
  commentSummary: { blockingCommentCount: 0 },
  reviewSummary: { changesRequestedCount: 0 },
};

const mergeReadyLifecycle = {
  currentStage: "merge_ready",
  target: { stage: "merge_ready", ready: true },
  blockingGaps: [] as string[],
};

test("merge release policy parses required defaults", () => {
  const policy = parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY);

  assert.equal(policy.requiredLifecycleStage, "merge_ready");
  assert.equal(policy.requiredPrGateState, "pass");
  assert.deepEqual(policy.allowedMergeMethods, ["squash", "merge", "rebase"]);
  assert.equal(policy.blockDraftPrs, true);
  assert.equal(policy.blockRequestedChanges, true);
  assert.equal(policy.blockBlockingComments, true);
  assert.equal(policy.blockLocalDirtOnApply, true);
  assert.equal(policy.allowAutoSyncMainByDefault, false);
});

test("check blocks when lifecycle is not merge-ready", () => {
  const result = assessMergeReadiness({
    policy: parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY),
    mode: "check",
    method: "squash",
    lifecycle: { currentStage: "submitted", target: { stage: "merge_ready", ready: false }, blockingGaps: ["pr_gate_clean requires PR gate clean/pass evidence."] },
    prGate: passingGate,
    pr: readyPr,
    repo: cleanRepo,
    syncMainRequested: false,
  });

  assert.equal(result.ready, false);
  assert.match(result.blockers.join("\n"), /lifecycle.*merge_ready/i);
  assert.match(result.blockers.join("\n"), /pr_gate_clean/i);
});

test("check blocks when PR gate did not pass", () => {
  const result = assessMergeReadiness({
    policy: parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY),
    mode: "check",
    method: "squash",
    lifecycle: mergeReadyLifecycle,
    prGate: { ...passingGate, finalStatus: "pending", recommendedNextAction: "wait_and_rerun" },
    pr: readyPr,
    repo: cleanRepo,
    syncMainRequested: false,
  });

  assert.equal(result.ready, false);
  assert.match(result.blockers.join("\n"), /PR gate.*pass/i);
});

test("apply blocks draft PRs, requested changes, blocking comments, and dirty local state", () => {
  const result = assessMergeReadiness({
    policy: parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY),
    mode: "apply",
    method: "squash",
    lifecycle: mergeReadyLifecycle,
    prGate: {
      finalStatus: "pass",
      recommendedNextAction: "fix_required",
      commentSummary: { blockingCommentCount: 1 },
      reviewSummary: { changesRequestedCount: 1 },
    },
    pr: {
      ...readyPr,
      isDraft: true,
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [{ author: { login: "reviewer" }, state: "CHANGES_REQUESTED", body: "needs work" }],
      comments: [{ author: { login: "reviewer" }, body: "blocking", url: "https://example/comment" }],
    },
    repo: { ...cleanRepo, dirtyFiles: ["README.md"] },
    syncMainRequested: false,
  });

  assert.equal(result.ready, false);
  assert.match(result.blockers.join("\n"), /draft/i);
  assert.match(result.blockers.join("\n"), /requested changes/i);
  assert.match(result.blockers.join("\n"), /blocking comments/i);
  assert.match(result.blockers.join("\n"), /local.*dirty/i);
});

test("invalid merge methods are rejected by policy", () => {
  assert.throws(() => normalizeMergeMethod("octopus", parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY)), /not allowed/i);
});

test("ready assessment passes only when all policy gates pass", () => {
  const result = assessMergeReadiness({
    policy: parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY),
    mode: "apply",
    method: "squash",
    lifecycle: mergeReadyLifecycle,
    prGate: passingGate,
    pr: readyPr,
    repo: cleanRepo,
    syncMainRequested: false,
  });

  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.recommendedNextAction, "apply_merge");
});

test("sync-main remains explicit and is reflected in readiness recommendation", () => {
  const result = assessMergeReadiness({
    policy: parseMergeReleasePolicy(DEFAULT_MERGE_RELEASE_POLICY),
    mode: "apply",
    method: "squash",
    lifecycle: mergeReadyLifecycle,
    prGate: passingGate,
    pr: readyPr,
    repo: cleanRepo,
    syncMainRequested: true,
  });

  assert.equal(result.ready, true);
  assert.equal(result.syncMainPlanned, true);
  assert.equal(result.recommendedNextAction, "apply_merge_then_sync_main");
}
);
