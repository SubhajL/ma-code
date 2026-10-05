import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { readTasksState, writeTasksState } from '../../.pi/agent/extensions/lib/tasks-state.ts';
import { readQueueState, writeQueueState } from '../../.pi/agent/extensions/lib/queue-state.ts';
import { makeTempRepo } from './test-utils.ts';

for (const empty of [false, true]) {
  test('initialized task state ignores contradictory JSON, empty=' + empty, async () => {
    const cwd = await makeTempRepo('canonical-tasks-');
    const state = { version: 1 as const, activeTaskId: null, tasks: empty ? [] : [{id:'current',status:'blocked'}] };
    await writeTasksState(cwd,state);
    await writeFile(join(cwd,'.pi/agent/state/runtime/tasks.json'), JSON.stringify({version:1, activeTaskId:'borrowed',tasks:[{id:'borrowed',status:'done'}]}));
    assert.deepEqual(await readTasksState(cwd),state);
  });
  test('initialized queue state ignores contradictory JSON, empty=' + empty, async () => {
    const cwd = await makeTempRepo('canonical-queue-');
    const state = { version: 1 as const, paused:false, activeJobId:null, jobs:empty ? [] : [{id:'current',status:'blocked'}] };
    await writeQueueState(cwd,state);
    await writeFile(join(cwd,'.pi/agent/state/runtime/queue.json'), JSON.stringify({version:1,paused:true,activeJobId:'borrowed',jobs:[{id:'borrowed',status:'done'}]}));
    assert.deepEqual(await readQueueState(cwd),state);
  });
}
