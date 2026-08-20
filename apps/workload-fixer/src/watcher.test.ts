import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as k8s from "@kubernetes/client-node";
import { WorkloadWatcher } from "./watcher";
import { FIX_ANNOTATION } from "./types";

const DEFAULT_CONFIG = {
  namespace: "test-ns",
  stuckThresholdSeconds: 300,
  pollIntervalSeconds: 30,
};

function makeSts(overrides: {
  name?: string;
  namespace?: string;
  annotations?: Record<string, string>;
  replicas?: number;
  readyReplicas?: number;
  currentRevision?: string;
  updateRevision?: string;
}): k8s.V1StatefulSet {
  return {
    metadata: {
      name: overrides.name ?? "my-sts",
      namespace: overrides.namespace ?? "test-ns",
      annotations: overrides.annotations ?? {},
    },
    spec: {
      replicas: overrides.replicas ?? 3,
      selector: { matchLabels: {} },
      template: { metadata: {}, spec: { containers: [] } },
    },
    status: {
      replicas: overrides.replicas ?? 3,
      readyReplicas: overrides.readyReplicas ?? 3,
      currentRevision: overrides.currentRevision ?? "rev-1",
      updateRevision: overrides.updateRevision ?? "rev-1",
    },
  };
}

function makePod(overrides: {
  name?: string;
  namespace?: string;
  ownerStsName?: string;
  revisionHash?: string;
  ready?: boolean;
  uid?: string;
}): k8s.V1Pod {
  return {
    metadata: {
      name: overrides.name ?? "my-sts-0",
      namespace: overrides.namespace ?? "test-ns",
      uid: overrides.uid,
      ownerReferences: overrides.ownerStsName
        ? [{ apiVersion: "apps/v1", kind: "StatefulSet", name: overrides.ownerStsName, uid: "uid-1" }]
        : [],
      labels: {
        "controller-revision-hash": overrides.revisionHash ?? "rev-1",
      },
    },
    status: {
      conditions: [
        {
          type: "Ready",
          status: overrides.ready !== false ? "True" : "False",
          lastTransitionTime: new Date(),
          lastProbeTime: undefined,
        },
      ],
    },
  };
}

function makeWatcher(): WorkloadWatcher {
  const kc = new k8s.KubeConfig();
  kc.loadFromOptions({
    clusters: [{ name: "test", server: "https://localhost:6443", skipTLSVerify: true }],
    users: [{ name: "test", token: "fake" }],
    contexts: [{ name: "test", cluster: "test", user: "test" }],
    currentContext: "test",
  });
  return new WorkloadWatcher(DEFAULT_CONFIG, kc);
}

describe("WorkloadWatcher.isOptedIn", () => {
  it("returns true when annotation is 'true'", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ annotations: { [FIX_ANNOTATION]: "true" } });
    assert.equal(watcher.isOptedIn(sts), true);
  });

  it("returns false when annotation is missing", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ annotations: {} });
    assert.equal(watcher.isOptedIn(sts), false);
  });

  it("returns false when annotation is 'false'", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ annotations: { [FIX_ANNOTATION]: "false" } });
    assert.equal(watcher.isOptedIn(sts), false);
  });
});

describe("WorkloadWatcher.isRolloutStuck", () => {
  it("returns false when revisions match and all pods ready", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ replicas: 3, readyReplicas: 3, currentRevision: "rev-1", updateRevision: "rev-1" });
    assert.equal(watcher.isRolloutStuck(sts), false);
  });

  it("returns true when revisions differ and not all pods ready", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ replicas: 3, readyReplicas: 2, currentRevision: "rev-1", updateRevision: "rev-2" });
    assert.equal(watcher.isRolloutStuck(sts), true);
  });

  it("returns false when revisions differ but all pods are ready", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ replicas: 3, readyReplicas: 3, currentRevision: "rev-1", updateRevision: "rev-2" });
    assert.equal(watcher.isRolloutStuck(sts), false);
  });

  it("returns false when revisions match but some pods not ready", () => {
    const watcher = makeWatcher();
    const sts = makeSts({ replicas: 3, readyReplicas: 1, currentRevision: "rev-1", updateRevision: "rev-1" });
    assert.equal(watcher.isRolloutStuck(sts), false);
  });

  it("returns false when status is missing", () => {
    const watcher = makeWatcher();
    const sts: k8s.V1StatefulSet = {
      metadata: { name: "sts" },
      spec: { replicas: 3, selector: { matchLabels: {} }, template: { metadata: {}, spec: { containers: [] } } },
    };
    assert.equal(watcher.isRolloutStuck(sts), false);
  });
});

describe("WorkloadWatcher.selectTargetPod", () => {
  it("selects a pod with the old revision hash that is not ready", () => {
    const watcher = makeWatcher();
    const pods = [
      makePod({ name: "sts-0", ownerStsName: "my-sts", revisionHash: "rev-2", ready: true }),
      makePod({ name: "sts-1", ownerStsName: "my-sts", revisionHash: "rev-1", ready: false }),
      makePod({ name: "sts-2", ownerStsName: "my-sts", revisionHash: "rev-1", ready: true }),
    ];
    const target = watcher.selectTargetPod(pods, "my-sts", "rev-2");
    assert.equal(target?.metadata?.name, "sts-1");
  });

  it("falls back to any pod with old revision hash when none are not-ready", () => {
    const watcher = makeWatcher();
    const pods = [
      makePod({ name: "sts-0", ownerStsName: "my-sts", revisionHash: "rev-2", ready: true }),
      makePod({ name: "sts-1", ownerStsName: "my-sts", revisionHash: "rev-1", ready: true }),
    ];
    const target = watcher.selectTargetPod(pods, "my-sts", "rev-2");
    assert.equal(target?.metadata?.name, "sts-1");
  });

  it("falls back to any not-ready pod when all have new revision", () => {
    const watcher = makeWatcher();
    const pods = [
      makePod({ name: "sts-0", ownerStsName: "my-sts", revisionHash: "rev-2", ready: true }),
      makePod({ name: "sts-1", ownerStsName: "my-sts", revisionHash: "rev-2", ready: false }),
    ];
    const target = watcher.selectTargetPod(pods, "my-sts", "rev-2");
    assert.equal(target?.metadata?.name, "sts-1");
  });

  it("returns null when no pods owned by the STS", () => {
    const watcher = makeWatcher();
    const pods = [
      makePod({ name: "other-0", ownerStsName: "other-sts", revisionHash: "rev-1" }),
    ];
    const target = watcher.selectTargetPod(pods, "my-sts", "rev-2");
    assert.equal(target, null);
  });

  it("returns null when pod list is empty", () => {
    const watcher = makeWatcher();
    const target = watcher.selectTargetPod([], "my-sts", "rev-2");
    assert.equal(target, null);
  });
});

// ── delete precondition tests ────────────────────────────────────────────────

type DeleteCall = { name: string; namespace: string; uid: string };

function makeStuckSts(): k8s.V1StatefulSet {
  return makeSts({
    annotations: { [FIX_ANNOTATION]: "true" },
    replicas: 2,
    readyReplicas: 1,
    currentRevision: "rev-1",
    updateRevision: "rev-2",
  });
}

function makeStuckPod(): k8s.V1Pod {
  return makePod({
    name: "my-sts-0",
    ownerStsName: "my-sts",
    revisionHash: "rev-1",
    ready: false,
    uid: "pod-uid-abc",
  });
}

describe("WorkloadWatcher delete UID precondition", () => {
  it("passes the observed pod UID as a delete precondition", async () => {
    const deleteCalls: DeleteCall[] = [];

    const appsApi = {
      listNamespacedStatefulSet: async () => ({ items: [makeStuckSts()] }),
    } as unknown as k8s.AppsV1Api;

    const coreApi = {
      listNamespacedPod: async () => ({ items: [makeStuckPod()] }),
      deleteNamespacedPod: async (params: { name: string; namespace: string; body?: { preconditions?: { uid?: string } } }) => {
        deleteCalls.push({ name: params.name, namespace: params.namespace, uid: params.body?.preconditions?.uid ?? "" });
      },
    } as unknown as k8s.CoreV1Api;

    const watcher = new WorkloadWatcher(
      { namespace: "test-ns", stuckThresholdSeconds: 0, pollIntervalSeconds: 30 },
      undefined,
      { appsApi, coreApi }
    );

    // First poll: detects stuck, records it in stuckMap.
    await watcher.poll();
    assert.equal(deleteCalls.length, 0, "should not delete on first detection");

    // Second poll: threshold (0s) exceeded, triggers delete.
    await watcher.poll();
    assert.equal(deleteCalls.length, 1, "should delete on second poll");
    assert.equal(deleteCalls[0]!.name, "my-sts-0");
    assert.equal(deleteCalls[0]!.uid, "pod-uid-abc");
  });

  it("treats a 404 response as harmless and does not throw", async () => {
    const appsApi = {
      listNamespacedStatefulSet: async () => ({ items: [makeStuckSts()] }),
    } as unknown as k8s.AppsV1Api;

    const coreApi = {
      listNamespacedPod: async () => ({ items: [makeStuckPod()] }),
      deleteNamespacedPod: async () => {
        const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
        throw err;
      },
    } as unknown as k8s.CoreV1Api;

    const watcher = new WorkloadWatcher(
      { namespace: "test-ns", stuckThresholdSeconds: 0, pollIntervalSeconds: 30 },
      undefined,
      { appsApi, coreApi }
    );

    await watcher.poll(); // seed stuckMap
    // Should resolve without throwing despite 404.
    await assert.doesNotReject(() => watcher.poll());
  });

  it("treats a 409 (UID conflict) response as harmless and does not throw", async () => {
    const appsApi = {
      listNamespacedStatefulSet: async () => ({ items: [makeStuckSts()] }),
    } as unknown as k8s.AppsV1Api;

    const coreApi = {
      listNamespacedPod: async () => ({ items: [makeStuckPod()] }),
      deleteNamespacedPod: async () => {
        const err = Object.assign(new Error("Conflict"), { statusCode: 409 });
        throw err;
      },
    } as unknown as k8s.CoreV1Api;

    const watcher = new WorkloadWatcher(
      { namespace: "test-ns", stuckThresholdSeconds: 0, pollIntervalSeconds: 30 },
      undefined,
      { appsApi, coreApi }
    );

    await watcher.poll(); // seed stuckMap
    await assert.doesNotReject(() => watcher.poll());
  });
});

