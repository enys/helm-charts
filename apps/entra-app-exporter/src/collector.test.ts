import { register, Registry } from "prom-client";

// Mock the Azure SDK modules
jest.mock("@azure/identity", () => ({
  ClientSecretCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: "mock-token", expiresOnTimestamp: Date.now() + 3600000 }),
  })),
  ManagedIdentityCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: "mock-token", expiresOnTimestamp: Date.now() + 3600000 }),
  })),
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: "mock-token", expiresOnTimestamp: Date.now() + 3600000 }),
  })),
}));

const mockGraphApiGet = jest.fn();
jest.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    initWithMiddleware: jest.fn().mockReturnValue({
      api: jest.fn().mockReturnValue({
        get: mockGraphApiGet,
      }),
    }),
  },
}));

jest.mock("@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials", () => ({
  TokenCredentialAuthenticationProvider: jest.fn().mockImplementation(() => ({})),
}));

import { EntraAppCollector } from "./collector";
import {
  appSecretDaysRemaining,
  appCertDaysRemaining,
  appSecretExpiryInfo,
  appCertExpiryInfo,
  appInfo,
  scrapeErrors,
} from "./metrics";

// Reset all metric values and the mock before each test
beforeEach(() => {
  mockGraphApiGet.mockReset();
  appSecretDaysRemaining.reset();
  appCertDaysRemaining.reset();
  appSecretExpiryInfo.reset();
  appCertExpiryInfo.reset();
  appInfo.reset();
  scrapeErrors.reset();
});

const defaultConfig = {
  tenantId: "test-tenant",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  useManagedIdentity: false,
  scrapeIntervalSeconds: 300,
};

describe("EntraAppCollector", () => {
  it("should collect metrics for apps with secrets", async () => {
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days from now
    const expiredDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago

    mockGraphApiGet.mockResolvedValueOnce({
      value: [
        {
          id: "obj-id-1",
          appId: "app-id-1",
          displayName: "Test App 1",
          createdDateTime: "2023-01-01T00:00:00Z",
          passwordCredentials: [
            {
              displayName: "My Secret",
              keyId: "key-1",
              endDateTime: futureDate,
              startDateTime: "2023-01-01T00:00:00Z",
            },
            {
              displayName: "Expired Secret",
              keyId: "key-2",
              endDateTime: expiredDate,
              startDateTime: "2022-01-01T00:00:00Z",
            },
          ],
          keyCredentials: [],
        },
      ],
    });

    const collector = new EntraAppCollector(defaultConfig);
    await collector.collect();

    const metrics = await register.getMetricsAsJSON();
    const secretDaysMetric = metrics.find((m) => m.name === "entra_app_secret_days_remaining");
    expect(secretDaysMetric).toBeDefined();
    expect(secretDaysMetric?.values.length).toBeGreaterThan(0);

    // Check that the future secret has positive days remaining
    const futureSecretValue = secretDaysMetric?.values.find(
      (v) => v.labels["secret_name"] === "My Secret"
    );
    expect(futureSecretValue).toBeDefined();
    expect(futureSecretValue?.value).toBeGreaterThan(0);

    // Check that the expired secret has negative days remaining
    const expiredSecretValue = secretDaysMetric?.values.find(
      (v) => v.labels["secret_name"] === "Expired Secret"
    );
    expect(expiredSecretValue).toBeDefined();
    expect(expiredSecretValue?.value).toBeLessThan(0);
  });

  it("should collect metrics for apps with certificates", async () => {
    const criticalDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days from now

    mockGraphApiGet.mockResolvedValueOnce({
      value: [
        {
          id: "obj-id-2",
          appId: "app-id-2",
          displayName: "Test App 2",
          createdDateTime: "2023-01-01T00:00:00Z",
          passwordCredentials: [],
          keyCredentials: [
            {
              displayName: "My Cert",
              keyId: "cert-key-1",
              endDateTime: criticalDate,
              startDateTime: "2023-01-01T00:00:00Z",
              type: "AsymmetricX509Cert",
              usage: "Verify",
            },
          ],
        },
      ],
    });

    const collector = new EntraAppCollector(defaultConfig);
    await collector.collect();

    const metrics = await register.getMetricsAsJSON();
    const certDaysMetric = metrics.find((m) => m.name === "entra_app_certificate_days_remaining");
    expect(certDaysMetric).toBeDefined();

    const certExpiryInfo = metrics.find((m) => m.name === "entra_app_certificate_expiry_info");
    expect(certExpiryInfo).toBeDefined();

    const criticalCert = certExpiryInfo?.values.find(
      (v) => v.labels["status"] === "critical"
    );
    expect(criticalCert).toBeDefined();
  });

  it("should handle pagination", async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    mockGraphApiGet
      .mockResolvedValueOnce({
        value: [
          {
            id: "obj-id-1",
            appId: "app-id-1",
            displayName: "App 1",
            createdDateTime: "2023-01-01T00:00:00Z",
            passwordCredentials: [
              { displayName: "Secret 1", keyId: "k1", endDateTime: futureDate },
            ],
            keyCredentials: [],
          },
        ],
        "@odata.nextLink": "/applications?$skiptoken=abc123",
      })
      .mockResolvedValueOnce({
        value: [
          {
            id: "obj-id-2",
            appId: "app-id-2",
            displayName: "App 2",
            createdDateTime: "2023-01-01T00:00:00Z",
            passwordCredentials: [],
            keyCredentials: [],
          },
        ],
      });

    const collector = new EntraAppCollector(defaultConfig);
    await collector.collect();

    const metrics = await register.getMetricsAsJSON();
    const appInfoMetric = metrics.find((m) => m.name === "entra_app_info");
    expect(appInfoMetric?.values.length).toBe(2);
  });

  it("should handle scrape errors and increment error counter", async () => {
    mockGraphApiGet.mockRejectedValueOnce(new Error("Graph API error"));

    const collector = new EntraAppCollector(defaultConfig);
    await collector.collect();

    const metrics = await register.getMetricsAsJSON();
    const errorsMetric = metrics.find(
      (m) => m.name === "entra_app_exporter_scrape_errors_total"
    );
    expect(errorsMetric).toBeDefined();
    expect(errorsMetric?.values[0]?.value).toBe(1);
  });

  it("should use managed identity when configured", async () => {
    const { ManagedIdentityCredential } = await import("@azure/identity");

    mockGraphApiGet.mockResolvedValueOnce({ value: [] });

    const collector = new EntraAppCollector({
      tenantId: "test-tenant",
      clientId: "managed-identity-client-id",
      useManagedIdentity: true,
      scrapeIntervalSeconds: 300,
    });

    await collector.collect();

    expect(ManagedIdentityCredential).toHaveBeenCalledWith({ clientId: "managed-identity-client-id" });
  });

  it("should use status 'ok' for secrets expiring in more than 30 days", async () => {
    const farFutureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    mockGraphApiGet.mockResolvedValueOnce({
      value: [
        {
          id: "obj-id-3",
          appId: "app-id-3",
          displayName: "Test App 3",
          passwordCredentials: [
            { displayName: "Safe Secret", keyId: "k3", endDateTime: farFutureDate },
          ],
          keyCredentials: [],
        },
      ],
    });

    const collector = new EntraAppCollector(defaultConfig);
    await collector.collect();

    const metrics = await register.getMetricsAsJSON();
    const expiryInfo = metrics.find((m) => m.name === "entra_app_secret_expiry_info");
    const safeSecret = expiryInfo?.values.find(
      (v) => v.labels["secret_name"] === "Safe Secret"
    );
    expect(safeSecret?.labels["status"]).toBe("ok");
  });

  it("should use status 'warning' for secrets expiring within 30 days", async () => {
    const warningDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

    mockGraphApiGet.mockResolvedValueOnce({
      value: [
        {
          id: "obj-id-4",
          appId: "app-id-4",
          displayName: "Test App 4",
          passwordCredentials: [
            { displayName: "Warning Secret", keyId: "k4", endDateTime: warningDate },
          ],
          keyCredentials: [],
        },
      ],
    });

    const collector = new EntraAppCollector(defaultConfig);
    await collector.collect();

    const metrics = await register.getMetricsAsJSON();
    const expiryInfo = metrics.find((m) => m.name === "entra_app_secret_expiry_info");
    const warningSecret = expiryInfo?.values.find(
      (v) => v.labels["secret_name"] === "Warning Secret"
    );
    expect(warningSecret?.labels["status"]).toBe("warning");
  });
});
