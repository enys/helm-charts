import * as k8s from "@kubernetes/client-node";
import { WatcherConfig, StsKey, StuckEntry, FIX_ANNOTATION } from "./types";

export class WorkloadWatcher {
  private readonly config: WatcherConfig;
  private readonly k8sAppsApi: k8s.AppsV1Api;
  private readonly k8sCoreApi: k8s.CoreV1Api;
  /** Tracks when each opted-in STS first entered a stuck state. */
  private readonly stuckMap = new Map<StsKey, StuckEntry>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: WatcherConfig,
    kc?: k8s.KubeConfig,
    apis?: { appsApi?: k8s.AppsV1Api; coreApi?: k8s.CoreV1Api }
  ) {
    this.config = config;
    if (apis?.appsApi && apis?.coreApi) {
      this.k8sAppsApi = apis.appsApi;
      this.k8sCoreApi = apis.coreApi;
    } else {
      const kubeConfig = kc ?? new k8s.KubeConfig();
      if (!kc) {
        kubeConfig.loadFromDefault();
      }
      this.k8sAppsApi = apis?.appsApi ?? kubeConfig.makeApiClient(k8s.AppsV1Api);
      this.k8sCoreApi = apis?.coreApi ?? kubeConfig.makeApiClient(k8s.CoreV1Api);
    }
  }

  start(): void {
    console.log(
      JSON.stringify({
        msg: "WorkloadWatcher starting",
        namespace: this.config.namespace || "(release namespace)",
        stuckThresholdSeconds: this.config.stuckThresholdSeconds,
        pollIntervalSeconds: this.config.pollIntervalSeconds,
      })
    );
    // Run immediately, then on interval without overlapping polls.
    let polling = false;
    const runPoll = async (): Promise<void> => {
      if (polling) return;
      polling = true;
      try {
        await this.poll();
      } finally {
        polling = false;
      }
    };
    void runPoll();
    this.intervalHandle = setInterval(
      () => void runPoll(),
      this.config.pollIntervalSeconds * 1000
    );
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async poll(): Promise<void> {
    try {
      const namespace = this.config.namespace;
      let stsList: k8s.V1StatefulSet[];

      if (namespace) {
        const resp = await this.k8sAppsApi.listNamespacedStatefulSet({ namespace });
        stsList = resp.items;
      } else {
        const resp = await this.k8sAppsApi.listStatefulSetForAllNamespaces();
        stsList = resp.items;
      }

      for (const sts of stsList) {
        await this.processSts(sts);
      }
    } catch (err) {
      console.error(
        JSON.stringify({ msg: "Poll error", error: String(err) })
      );
    }
  }

  /**
   * Returns whether `sts` has the opt-in annotation set to "true".
   * Exported for testing.
   */
  isOptedIn(sts: k8s.V1StatefulSet): boolean {
    return sts.metadata?.annotations?.[FIX_ANNOTATION] === "true";
  }

  /**
   * Returns whether the StatefulSet is currently in a stuck rollout state.
   * Stuck = rollout in progress AND not all pods are ready.
   * Exported for testing.
   */
  isRolloutStuck(sts: k8s.V1StatefulSet): boolean {
    const status = sts.status;
    const spec = sts.spec;
    if (!status || !spec) return false;

    const desiredReplicas = spec.replicas ?? 1;
    const readyReplicas = status.readyReplicas ?? 0;
    const currentRevision = status.currentRevision ?? "";
    const updateRevision = status.updateRevision ?? "";

    // A rollout is in progress when the revisions differ.
    const rolloutInProgress = currentRevision !== "" && updateRevision !== "" && currentRevision !== updateRevision;
    const notAllReady = readyReplicas < desiredReplicas;

    return rolloutInProgress && notAllReady;
  }

  private stsKey(sts: k8s.V1StatefulSet): StsKey {
    const ns = sts.metadata?.namespace ?? "default";
    const name = sts.metadata?.name ?? "";
    return `${ns}/${name}`;
  }

  private async processSts(sts: k8s.V1StatefulSet): Promise<void> {
    if (!this.isOptedIn(sts)) {
      // Clear any stale stuck state if the annotation was removed.
      const key = this.stsKey(sts);
      this.stuckMap.delete(key);
      return;
    }

    const key = this.stsKey(sts);

    if (!this.isRolloutStuck(sts)) {
      // Rollout is healthy — clear stuck state if we were tracking it.
      if (this.stuckMap.has(key)) {
        console.log(JSON.stringify({ msg: "Rollout recovered", sts: key }));
        this.stuckMap.delete(key);
      }
      return;
    }

    const updateRevision = sts.status?.updateRevision ?? "";
    const now = new Date();
    const existing = this.stuckMap.get(key);

    if (!existing || existing.pendingRevision !== updateRevision) {
      // New stuck state (or a new rollout started and got stuck).
      this.stuckMap.set(key, { since: now, pendingRevision: updateRevision });
      console.log(
        JSON.stringify({
          msg: "Stuck rollout detected",
          sts: key,
          updateRevision,
        })
      );
      return;
    }

    const stuckForSeconds = (now.getTime() - existing.since.getTime()) / 1000;
    if (stuckForSeconds < this.config.stuckThresholdSeconds) {
      // Not yet stuck long enough.
      return;
    }

    await this.fixStuckRollout(sts, Math.round(stuckForSeconds));  }

  /**
   * Finds and deletes the pod blocking the rollout.
   *
   * For a StatefulSet rolling update, the pod blocking progress is typically
   * the pod that has the OLD revision hash and is not ready. We look for:
   * 1. A pod with `controller-revision-hash` != `updateRevision` that is not ready, OR
   * 2. A pod that is in a non-Running/Pending state.
   *
   * We delete at most one pod per invocation to avoid cascading deletes.
   */
  private async fixStuckRollout(sts: k8s.V1StatefulSet, stuckForSeconds: number): Promise<void> {
    const namespace = sts.metadata?.namespace ?? "default";
    const stsName = sts.metadata?.name ?? "";
    const updateRevision = sts.status?.updateRevision ?? "";
    const key = this.stsKey(sts);

    let podList: k8s.V1Pod[];
    try {
      // Build the label selector from the StatefulSet's own spec.selector.matchLabels,
      // which is the canonical set Kubernetes uses to claim pods for this STS.
      const matchLabels = sts.spec?.selector?.matchLabels ?? {};
      const labelSelector = Object.entries(matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(",");

      const resp = await this.k8sCoreApi.listNamespacedPod({
        namespace,
        ...(labelSelector ? { labelSelector } : {}),
      });

      // Always filter by owner reference: the label selector alone may match pods
      // that belong to a different controller (e.g. a Deployment sharing labels).
      podList = resp.items.filter((p) =>
        p.metadata?.ownerReferences?.some(
          (ref) => ref.kind === "StatefulSet" && ref.name === stsName
        )
      );
    } catch (err) {
      console.error(
        JSON.stringify({ msg: "Failed to list pods", sts: key, error: String(err) })
      );
      return;
    }

    // Prefer pods owned by the STS that have the old revision hash.
    const targetPod = this.selectTargetPod(podList, stsName, updateRevision);

    if (!targetPod) {
      console.warn(
        JSON.stringify({ msg: "No suitable pod found to delete", sts: key })
      );
      return;
    }

    const podName = targetPod.metadata?.name ?? "";
    const podUid = targetPod.metadata?.uid ?? "";

    console.log(
      JSON.stringify({
        msg: "Stuck rollout threshold exceeded, attempting fix",
        sts: key,
        pod: podName,
        stuckForSeconds,
        updateRevision,
      })
    );

    try {
      await this.k8sCoreApi.deleteNamespacedPod({
        name: podName,
        namespace,
        body: {
          apiVersion: "v1",
          kind: "DeleteOptions",
          preconditions: { uid: podUid },
        },
      });
      console.log(
        JSON.stringify({
          msg: "Deleted stuck pod",
          sts: key,
          pod: podName,
          uid: podUid,
        })
      );
      // Reset stuck tracking — the rollout has been nudged.
      this.stuckMap.delete(key);
    } catch (err) {
      // A 404 (pod already gone) or 409 (UID mismatch — pod was replaced
      // between list and delete) are both harmless: the rollout was already
      // nudged or the pod we observed no longer exists. Log and let the next
      // poll cycle re-evaluate.
      const status = (err as { statusCode?: number; body?: { code?: number } })
        ?.statusCode ?? (err as { body?: { code?: number } })?.body?.code;
      if (status === 404 || status === 409) {
        console.log(
          JSON.stringify({
            msg: "Pod delete skipped (already gone or replaced)",
            sts: key,
            pod: podName,
            uid: podUid,
            httpStatus: status,
          })
        );
        return;
      }
      console.error(
        JSON.stringify({
          msg: "Failed to delete pod",
          sts: key,
          pod: podName,
          uid: podUid,
          error: String(err),
        })
      );
    }
  }

  /**
   * Selects the best pod to delete to unblock the rollout.
   * Exported for testing.
   */
  selectTargetPod(
    pods: k8s.V1Pod[],
    stsName: string,
    updateRevision: string
  ): k8s.V1Pod | null {
    // Filter to pods owned by this STS.
    const stsPods = pods.filter((p) =>
      p.metadata?.ownerReferences?.some(
        (ref) => ref.kind === "StatefulSet" && ref.name === stsName
      )
    );

    if (stsPods.length === 0) return null;

    // Prefer a pod with the old revision hash that is not ready.
    const oldRevisionNotReady = stsPods.filter((p) => {
      const revisionHash = p.metadata?.labels?.["controller-revision-hash"] ?? "";
      const ready = p.status?.conditions?.find((c) => c.type === "Ready")?.status === "True";
      return revisionHash !== updateRevision && !ready;
    });

    if (oldRevisionNotReady.length > 0) {
      return oldRevisionNotReady[0]!;
    }

    // Fall back to any pod with the old revision hash.
    const oldRevision = stsPods.filter(
      (p) => (p.metadata?.labels?.["controller-revision-hash"] ?? "") !== updateRevision
    );

    if (oldRevision.length > 0) return oldRevision[0]!;

    // Last resort: any pod that is not ready.
    const notReady = stsPods.filter(
      (p) => p.status?.conditions?.find((c) => c.type === "Ready")?.status !== "True"
    );

    return notReady[0] ?? null;
  }
}
