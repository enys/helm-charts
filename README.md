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

### Validating charts locally (ct)

```bash
ct lint --chart-dirs charts --charts charts/entra-app-exporter
ct install --chart-dirs charts --charts charts/entra-app-exporter
```

The CI workflow uses the same `ct lint` and `ct install` checks.

### Releasing charts

Charts are published from `main` with `helm/chart-releaser-action` (workflow: `.github/workflows/release-charts.yml`) and served from:

```text
https://enys.github.io/helm-charts
```

### Building the app

```bash
cd apps/entra-app-exporter
npm install
npm run build
npm test
```
