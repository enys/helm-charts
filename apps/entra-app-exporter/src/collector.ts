import { ClientSecretCredential, ManagedIdentityCredential, DefaultAzureCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import {
  appSecretDaysRemaining,
  appCertDaysRemaining,
  appSecretExpiryInfo,
  appCertExpiryInfo,
  appInfo,
  scrapeErrors,
  lastScrapeTime,
} from "./metrics";

export interface CollectorConfig {
  tenantId: string;
  clientId?: string;
  clientSecret?: string;
  useManagedIdentity: boolean;
  scrapeIntervalSeconds: number;
}

interface PasswordCredential {
  displayName?: string | null;
  endDateTime?: string | null;
  keyId?: string | null;
  startDateTime?: string | null;
  hint?: string | null;
}

interface KeyCredential {
  displayName?: string | null;
  endDateTime?: string | null;
  keyId?: string | null;
  startDateTime?: string | null;
  type?: string | null;
  usage?: string | null;
}

interface Application {
  id?: string | null;
  appId?: string | null;
  displayName?: string | null;
  createdDateTime?: string | null;
  passwordCredentials?: PasswordCredential[];
  keyCredentials?: KeyCredential[];
}

export class EntraAppCollector {
  private graphClient: Client;
  private config: CollectorConfig;

  constructor(config: CollectorConfig) {
    this.config = config;
    this.graphClient = this.createGraphClient();
  }

  private createGraphClient(): Client {
    let credential;

    if (this.config.useManagedIdentity) {
      credential = this.config.clientId
        ? new ManagedIdentityCredential({ clientId: this.config.clientId })
        : new ManagedIdentityCredential();
    } else if (this.config.clientId && this.config.clientSecret) {
      credential = new ClientSecretCredential(
        this.config.tenantId,
        this.config.clientId,
        this.config.clientSecret
      );
    } else {
      credential = new DefaultAzureCredential();
    }

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });

    return Client.initWithMiddleware({ authProvider });
  }

  async collect(): Promise<void> {
    const startTime = Date.now();

    try {
      const applications = await this.fetchAllApplications();

      // Reset gauges before repopulating
      appSecretDaysRemaining.reset();
      appCertDaysRemaining.reset();
      appSecretExpiryInfo.reset();
      appCertExpiryInfo.reset();
      appInfo.reset();

      for (const app of applications) {
        const appName = app.displayName ?? "unknown";
        const appId = app.appId ?? "unknown";
        const objectId = app.id ?? "unknown";

        appInfo.set({ app_name: appName, app_id: appId, object_id: objectId }, 1);

        this.processPasswordCredentials(app, appName, appId);
        this.processKeyCredentials(app, appName, appId);
      }

      lastScrapeTime.setToCurrentTime();
    } catch (error) {
      scrapeErrors.inc();
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error collecting Entra app metrics:", message);
    }

    console.log(`Collection completed in ${Date.now() - startTime}ms`);
  }

  private async fetchAllApplications(): Promise<Application[]> {
    const applications: Application[] = [];
    let nextLink: string | undefined =
      "/applications?$select=id,appId,displayName,createdDateTime,passwordCredentials,keyCredentials&$top=999";

    while (nextLink) {
      const response = await this.graphClient.api(nextLink).get() as {
        value: Application[];
        "@odata.nextLink"?: string;
      };

      applications.push(...(response.value ?? []));
      nextLink = response["@odata.nextLink"];
    }

    return applications;
  }

  private processPasswordCredentials(app: Application, appName: string, appId: string): void {
    const credentials = app.passwordCredentials ?? [];

    for (const cred of credentials) {
      const secretName = cred.displayName ?? cred.keyId ?? "unnamed";
      const keyId = cred.keyId ?? "unknown";

      if (!cred.endDateTime) {
        // No expiry set — use sentinel value of 99999 (Prometheus cannot represent Infinity)
        appSecretDaysRemaining.set(
          { app_name: appName, app_id: appId, secret_name: secretName, key_id: keyId },
          99999
        );
        appSecretExpiryInfo.set(
          {
            app_name: appName,
            app_id: appId,
            secret_name: secretName,
            key_id: keyId,
            expiry_date: "never",
            status: "no_expiry",
          },
          1
        );
        continue;
      }

      const expiryDate = new Date(cred.endDateTime);
      const now = new Date();
      const daysRemaining = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      appSecretDaysRemaining.set(
        { app_name: appName, app_id: appId, secret_name: secretName, key_id: keyId },
        daysRemaining
      );

      const status = this.getExpiryStatus(daysRemaining);
      appSecretExpiryInfo.set(
        {
          app_name: appName,
          app_id: appId,
          secret_name: secretName,
          key_id: keyId,
          expiry_date: expiryDate.toISOString(),
          status,
        },
        1
      );
    }
  }

  private processKeyCredentials(app: Application, appName: string, appId: string): void {
    const credentials = app.keyCredentials ?? [];

    for (const cred of credentials) {
      const certName = cred.displayName ?? cred.keyId ?? "unnamed";
      const keyId = cred.keyId ?? "unknown";
      const certType = cred.type ?? "unknown";

      if (!cred.endDateTime) {
        // No expiry set — use sentinel value of 99999 (Prometheus cannot represent Infinity)
        appCertDaysRemaining.set(
          { app_name: appName, app_id: appId, cert_name: certName, key_id: keyId, cert_type: certType },
          99999
        );
        appCertExpiryInfo.set(
          {
            app_name: appName,
            app_id: appId,
            cert_name: certName,
            key_id: keyId,
            cert_type: certType,
            expiry_date: "never",
            status: "no_expiry",
          },
          1
        );
        continue;
      }

      const expiryDate = new Date(cred.endDateTime);
      const now = new Date();
      const daysRemaining = Math.floor(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      appCertDaysRemaining.set(
        { app_name: appName, app_id: appId, cert_name: certName, key_id: keyId, cert_type: certType },
        daysRemaining
      );

      const status = this.getExpiryStatus(daysRemaining);
      appCertExpiryInfo.set(
        {
          app_name: appName,
          app_id: appId,
          cert_name: certName,
          key_id: keyId,
          cert_type: certType,
          expiry_date: expiryDate.toISOString(),
          status,
        },
        1
      );
    }
  }

  private getExpiryStatus(daysRemaining: number): string {
    if (daysRemaining < 0) return "expired";
    if (daysRemaining <= 7) return "critical";
    if (daysRemaining <= 30) return "warning";
    return "ok";
  }

  startPeriodicCollection(): void {
    // Run immediately
    void this.collect();

    // Then run on interval
    setInterval(() => {
      void this.collect();
    }, this.config.scrapeIntervalSeconds * 1000);
  }
}
