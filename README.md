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
