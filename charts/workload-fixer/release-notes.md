## Workload Fixer

The Workload Fixer Helm chart deploys a Kubernetes controller that detects
stuck StatefulSet rolling updates and deletes the blocked pod so the rollout
can continue.

### Highlights

- Watches a selected namespace or the entire cluster.
- Configurable stuck-rollout threshold and polling interval.
- Supports namespaced or cluster-scoped RBAC.
- Includes optional ServiceMonitor, PrometheusRule, and Grafana dashboard
  resources.

### Installation

```bash
helm repo add enys-charts https://enys.github.io/helm-charts
helm repo update
helm install workload-fixer enys-charts/workload-fixer
```
