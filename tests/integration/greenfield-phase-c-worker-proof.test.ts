import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(new URL("../..", import.meta.url).pathname);

test("Greenfield Phase C proof artifact materializes exactly one bounded worker proof job", async () => {
  const { stdout } = await execFile(process.execPath, ["scripts/validate-greenfield-phase-c.mjs", "--json"], { cwd: repoRoot });
  const report = JSON.parse(stdout) as {
    phase: string;
    sourcePhaseBQueueReadiness: string;
    liveWorkerExecutionReady: boolean;
    proofJobs: Array<{
      id: string;
      sourceCandidateId: string;
      status: string;
      queueJobSource?: { kind?: string; initiativeId?: string; issueId?: string };
      allowedPaths?: string[];
      implementationCommand?: string;
      validationCommands?: string[];
      prBoundary?: { stopBeforePr?: boolean; allowPrCreate?: boolean };
    }>;
    errors: string[];
  };

  assert.equal(report.phase, "C_worker_execution_proof");
  assert.equal(report.sourcePhaseBQueueReadiness, "candidate_only");
  assert.equal(report.liveWorkerExecutionReady, false);
  assert.deepEqual(report.errors, []);
  assert.equal(report.proofJobs.length, 1);

  const [job] = report.proofJobs;
  assert.equal(job.id, "phase-c-greenfield-worker-proof-issue-002");
  assert.equal(job.sourceCandidateId, "issue-002");
  assert.equal(job.status, "materialized_proof_only");
  assert.equal(job.queueJobSource?.kind, "issue-materialization");
  assert.equal(job.queueJobSource?.initiativeId, "greenfield-scaffold");
  assert.equal(job.queueJobSource?.issueId, "issue-002");
  assert.ok(job.allowedPaths?.includes("docs/initiatives/greenfield-scaffold"));
  assert.match(String(job.implementationCommand), /phase-c-worker-proof\.md/);
  assert.ok((job.validationCommands ?? []).includes("npm run validate:greenfield-phase-c"));
  assert.equal(job.prBoundary?.stopBeforePr, true);
  assert.equal(job.prBoundary?.allowPrCreate, false);
});
