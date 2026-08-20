export interface WatcherConfig {
  /** Kubernetes namespace(s) to watch. Empty string means the pod's own namespace. */
  namespace: string;
  /** How long (seconds) a rollout must be stuck before the fixer acts. */
  stuckThresholdSeconds: number;
  /** How often (seconds) to poll the Kubernetes API. */
  pollIntervalSeconds: number;
}

/**
 * Key identifying a StatefulSet: "<namespace>/<name>"
 */
export type StsKey = string;

/**
 * Represents the moment a particular StatefulSet was first observed in a stuck state.
 */
export interface StuckEntry {
  /** Wall-clock time when the stuck state was first detected. */
  since: Date;
  /** The update revision that was pending when we first detected the stuck state. */
  pendingRevision: string;
}

/** Annotation key that opts a StatefulSet in to automatic fix. */
export const FIX_ANNOTATION = "workload-fixer/fix-stuck-rollout";
