import { Gauge, Counter } from "prom-client";

export const stuckRolloutsDetected = new Counter({
  name: "workload_fixer_stuck_rollouts_detected_total",
  help: "Total number of stuck StatefulSet rollouts detected.",
  labelNames: ["namespace", "statefulset"],
});

export const rolloutsRecovered = new Counter({
  name: "workload_fixer_rollouts_recovered_total",
  help: "Total number of previously stuck StatefulSet rollouts that recovered on their own.",
  labelNames: ["namespace", "statefulset"],
});

export const podsDeleted = new Counter({
  name: "workload_fixer_pods_deleted_total",
  help: "Total number of pods deleted to unblock a stuck StatefulSet rollout.",
  labelNames: ["namespace", "statefulset"],
});

export const stuckDurationSeconds = new Gauge({
  name: "workload_fixer_stuck_duration_seconds",
  help: "How long (in seconds) a StatefulSet rollout has currently been stuck. Absent when not stuck.",
  labelNames: ["namespace", "statefulset"],
});

export const pollErrors = new Counter({
  name: "workload_fixer_poll_errors_total",
  help: "Total number of errors encountered while polling the Kubernetes API.",
});

export const lastPollTimestamp = new Gauge({
  name: "workload_fixer_last_poll_timestamp_seconds",
  help: "Unix timestamp of the last successful poll of the Kubernetes API.",
});
