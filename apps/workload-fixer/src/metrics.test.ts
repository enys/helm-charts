import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stuckRolloutsDetected,
  rolloutsRecovered,
  podsDeleted,
  stuckDurationSeconds,
  pollErrors,
  lastPollTimestamp,
} from "./metrics";

describe("metrics module", () => {
  it("should export all required metrics", () => {
    assert.ok(stuckRolloutsDetected);
    assert.ok(rolloutsRecovered);
    assert.ok(podsDeleted);
    assert.ok(stuckDurationSeconds);
    assert.ok(pollErrors);
    assert.ok(lastPollTimestamp);
  });

  it("should have correct metric names", () => {
    const asName = (m: unknown) => (m as { name: string }).name;
    assert.equal(asName(stuckRolloutsDetected), "workload_fixer_stuck_rollouts_detected_total");
    assert.equal(asName(rolloutsRecovered), "workload_fixer_rollouts_recovered_total");
    assert.equal(asName(podsDeleted), "workload_fixer_pods_deleted_total");
    assert.equal(asName(stuckDurationSeconds), "workload_fixer_stuck_duration_seconds");
    assert.equal(asName(pollErrors), "workload_fixer_poll_errors_total");
    assert.equal(asName(lastPollTimestamp), "workload_fixer_last_poll_timestamp_seconds");
  });
});
