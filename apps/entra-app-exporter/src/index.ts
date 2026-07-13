import express from "express";
import { register } from "prom-client";
import { EntraAppCollector, CollectorConfig } from "./collector";

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function getEnvOrDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function buildConfig(): CollectorConfig {
  const tenantId = getEnvOrThrow("AZURE_TENANT_ID");
  const useManagedIdentity = getEnvOrDefault("USE_MANAGED_IDENTITY", "false").toLowerCase() === "true";
  const scrapeIntervalSeconds = parseInt(getEnvOrDefault("SCRAPE_INTERVAL_SECONDS", "300"), 10);

  if (useManagedIdentity) {
    return {
      tenantId,
      clientId: process.env["AZURE_CLIENT_ID"],
      useManagedIdentity: true,
      scrapeIntervalSeconds,
    };
  }

  const clientId = getEnvOrThrow("AZURE_CLIENT_ID");
  const clientSecret = getEnvOrThrow("AZURE_CLIENT_SECRET");

  return {
    tenantId,
    clientId,
    clientSecret,
    useManagedIdentity: false,
    scrapeIntervalSeconds,
  };
}

async function main(): Promise<void> {
  const port = parseInt(getEnvOrDefault("PORT", "9090"), 10);

  let config: CollectorConfig;
  try {
    config = buildConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Configuration error:", message);
    process.exit(1);
  }

  const collector = new EntraAppCollector(config);
  collector.startPeriodicCollection();

  const app = express();

  app.get("/metrics", async (_req, res) => {
    try {
      res.set("Content-Type", register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error rendering metrics:", message);
      res.status(500).end("Internal server error");
    }
  });

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(port, () => {
    console.log(`entra-app-exporter listening on port ${port}`);
    console.log(`Metrics available at http://0.0.0.0:${port}/metrics`);
    console.log(`Scrape interval: ${config.scrapeIntervalSeconds}s`);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
