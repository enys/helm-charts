## Entra App Exporter

The Entra App Exporter Helm chart deploys a Prometheus exporter that collects
Microsoft Entra application registration details from Microsoft Graph and
exposes client secret and certificate expiration metrics.

### Highlights

- Alerts on secrets and certificates that are approaching expiration.
- Supports Azure client credentials and managed identity authentication.
- Includes optional ServiceMonitor, PrometheusRule, Grafana dashboard, HPA,
  and NetworkPolicy resources.

### Installation

```bash
helm repo add enys-charts https://enys.github.io/helm-charts
helm repo update
helm install entra-app-exporter enys-charts/entra-app-exporter
```

See the [chart documentation](https://github.com/enys/helm-charts/tree/main/charts/entra-app-exporter)
for required Azure values and configuration options.
