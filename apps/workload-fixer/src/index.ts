import express from "express";
import { WorkloadWatcher } from "./watcher";
import { WatcherConfig } from "./types";

function getEnvOrDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function buildConfig(): WatcherConfig {
  const stuckThresholdRaw = getEnvOrDefault("STUCK_THRESHOLD_SECONDS", "300");
  const stuckThresholdSeconds = Number.parseInt(stuckThresholdRaw, 10);
  if (!Number.isFinite(stuckThresholdSeconds) || stuckThresholdSeconds <= 0) {
    throw new Error(
      `STUCK_THRESHOLD_SECONDS must be a positive integer (got ${stuckThresholdRaw})`
    );
  }

  const pollIntervalRaw = getEnvOrDefault("POLL_INTERVAL_SECONDS", "30");
  const pollIntervalSeconds = Number.parseInt(pollIntervalRaw, 10);
  if (!Number.isFinite(pollIntervalSeconds) || pollIntervalSeconds <= 0) {
    throw new Error(
      `POLL_INTERVAL_SECONDS must be a positive integer (got ${pollIntervalRaw})`
    );
  }

  return {
    namespace: getEnvOrDefault("NAMESPACE", ""),
    stuckThresholdSeconds,
    pollIntervalSeconds,
  };
}

async function main(): Promise<void> {
  const portRaw = getEnvOrDefault("PORT", "9090");
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got ${portRaw})`);
  }

  let config: WatcherConfig;
  try {
    config = buildConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Configuration error:", message);
    process.exit(1);
  }

  const watcher = new WorkloadWatcher(config);
  watcher.start();

  const app = express();

  app.use((req, res, next) => {
    const startTime = process.hrtime.bigint();

    const logRequest = (event: "finish" | "close") => {
      const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      const path = req.path.replace(/[\r\n]/g, "");
      console.log(
        JSON.stringify({
          method: req.method,
          path,
          status: res.statusCode,
          durationMs: Number(durationMs.toFixed(1)),
          event,
        })
      );
    };

    res.once("finish", () => logRequest("finish"));
    res.once("close", () => {
      if (!res.writableEnded) logRequest("close");
    });

    next();
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(port, () => {
    console.log(
      JSON.stringify({
        msg: "workload-fixer listening",
        port,
        namespace: config.namespace || "(release namespace)",
        stuckThresholdSeconds: config.stuckThresholdSeconds,
        pollIntervalSeconds: config.pollIntervalSeconds,
      })
    );
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
