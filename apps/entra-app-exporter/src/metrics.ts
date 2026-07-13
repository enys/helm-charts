import { Gauge, Counter } from "prom-client";

export const appSecretDaysRemaining = new Gauge({
  name: "entra_app_secret_days_remaining",
  help: "Number of days until an Azure Entra application client secret expires. Negative values indicate the secret has already expired.",
  labelNames: ["app_name", "app_id", "secret_name", "key_id"],
});

export const appCertDaysRemaining = new Gauge({
  name: "entra_app_certificate_days_remaining",
  help: "Number of days until an Azure Entra application certificate expires. Negative values indicate the certificate has already expired.",
  labelNames: ["app_name", "app_id", "cert_name", "key_id", "cert_type"],
});

export const appSecretExpiryInfo = new Gauge({
  name: "entra_app_secret_expiry_info",
  help: "Information gauge for Azure Entra application client secrets, including expiry date and status. Value is always 1.",
  labelNames: ["app_name", "app_id", "secret_name", "key_id", "expiry_date", "status"],
});

export const appCertExpiryInfo = new Gauge({
  name: "entra_app_certificate_expiry_info",
  help: "Information gauge for Azure Entra application certificates, including expiry date and status. Value is always 1.",
  labelNames: ["app_name", "app_id", "cert_name", "key_id", "cert_type", "expiry_date", "status"],
});

export const appInfo = new Gauge({
  name: "entra_app_info",
  help: "General information about Azure Entra application registrations. Value is always 1.",
  labelNames: ["app_name", "app_id", "object_id"],
});

export const scrapeErrors = new Counter({
  name: "entra_app_exporter_scrape_errors_total",
  help: "Total number of errors encountered while scraping Azure Entra application data.",
});

export const lastScrapeTime = new Gauge({
  name: "entra_app_exporter_last_scrape_timestamp_seconds",
  help: "Unix timestamp of the last successful scrape of Azure Entra application data.",
});
