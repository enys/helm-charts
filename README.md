# helm-charts

A collection of Helm charts for Kubernetes.

## Charts

| Chart | Description | Version |
|-------|-------------|---------|
| [entra-app-exporter](charts/entra-app-exporter) | Prometheus exporter for Azure Entra app registration secrets and certificate expiration | 0.1.0 |

## Usage

```bash
helm repo add enys-charts https://enys.github.io/helm-charts
helm repo update
```

## Development

Each chart lives under `charts/<chart-name>/`. The TypeScript application source code for chart workloads lives under `apps/<app-name>/`.

### Linting a chart

```bash
helm lint charts/entra-app-exporter -f charts/entra-app-exporter/ci/default-values.yaml
```

### Building the app

```bash
cd apps/entra-app-exporter
npm install
npm run build
npm test
```

### Running with Tilt

```bash
tilt up
```

Tilt deploys `charts/entra-app-exporter` as release `entra-app-exporter-tilt` and forwards `localhost:9090` to the app service.

Provide required Helm values in `tilt-values.yaml` at the repository root (it is gitignored).

`tilt-values.yaml` must define:

```yaml
azure:
  tenantId: "<TENANT_ID>"
  clientId: "<CLIENT_ID>"
  clientSecret: "<CLIENT_SECRET>"
```

The Entra app referenced by `clientId` must have Microsoft Graph **application** permission `Application.Read.All` with admin consent granted.
