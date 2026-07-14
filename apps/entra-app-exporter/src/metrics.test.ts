import {
  appSecretDaysRemaining,
  appCertDaysRemaining,
  appSecretExpiryInfo,
  appCertExpiryInfo,
  appInfo,
  scrapeErrors,
  lastScrapeTime,
} from "./metrics";

describe("metrics module", () => {
  it("should export all required metrics", () => {
    expect(appSecretDaysRemaining).toBeDefined();
    expect(appCertDaysRemaining).toBeDefined();
    expect(appSecretExpiryInfo).toBeDefined();
    expect(appCertExpiryInfo).toBeDefined();
    expect(appInfo).toBeDefined();
    expect(scrapeErrors).toBeDefined();
    expect(lastScrapeTime).toBeDefined();
  });

  it("should have correct metric names", () => {
    // prom-client Gauge has a `name` property accessible via its internal structure
    // We verify via the hashMap key used during registration
    const secretMetric = appSecretDaysRemaining as unknown as { name: string };
    const certMetric = appCertDaysRemaining as unknown as { name: string };
    const infoMetric = appInfo as unknown as { name: string };
    const errorsMetric = scrapeErrors as unknown as { name: string };

    expect(secretMetric.name).toBe("entra_app_secret_days_remaining");
    expect(certMetric.name).toBe("entra_app_certificate_days_remaining");
    expect(infoMetric.name).toBe("entra_app_info");
    expect(errorsMetric.name).toBe("entra_app_exporter_scrape_errors_total");
  });

  it("should have correct label names for appSecretDaysRemaining", () => {
    const metric = appSecretDaysRemaining as unknown as { labelNames: string[] };
    expect(metric.labelNames).toEqual(
      expect.arrayContaining(["app_name", "app_id", "secret_name", "key_id"])
    );
  });

  it("should have correct label names for appCertDaysRemaining", () => {
    const metric = appCertDaysRemaining as unknown as { labelNames: string[] };
    expect(metric.labelNames).toEqual(
      expect.arrayContaining(["app_name", "app_id", "cert_name", "key_id", "cert_type"])
    );
  });
});
