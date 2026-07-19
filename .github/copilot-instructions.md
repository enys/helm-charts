# Copilot instructions for `enys/helm-charts`

## Build, test, and lint commands

Run from repository root unless noted.

| Purpose | Command |
|---|---|
| Build TypeScript app | `cd apps/entra-app-exporter && npm run build` |
| Lint TypeScript app | `cd apps/entra-app-exporter && npm run lint` |
| Run full app tests | `cd apps/entra-app-exporter && npm test` |
| Run a single Jest test file | `cd apps/entra-app-exporter && npm test -- --runTestsByPath src/collector.test.ts` |
| Run a single Jest test case | `cd apps/entra-app-exporter && npm test -- -t "should handle pagination"` |
| Lint Helm chart with chart-testing | `ct lint --chart-dirs charts --charts charts/entra-app-exporter` |
| Install-test Helm chart with chart-testing | `ct install --chart-dirs charts --charts charts/entra-app-exporter` |
| Lint Helm chart with CI values | `helm lint charts/entra-app-exporter -f charts/entra-app-exporter/ci/default-values.yaml` |
| Run local Kubernetes dev loop with Tilt | `tilt up` |

## High-level architecture

- This repo couples one deployable app and one Helm chart: application source in `apps/entra-app-exporter`, Kubernetes packaging in `charts/entra-app-exporter`.
- Runtime flow is `src/index.ts` (HTTP server, env parsing, health/ready/metrics endpoints) -> `src/collector.ts` (Graph API pagination + collection loop) -> `src/metrics.ts` (Prometheus metric definitions).
- The chart’s `templates/deployment.yaml` maps Helm values to runtime env vars (`PORT`, `SCRAPE_INTERVAL_SECONDS`, Azure auth vars), so changes to config/env expectations in app code must be mirrored in chart values/templates.
- Azure credential wiring is abstracted via `templates/_helpers.tpl` (`entra-app-exporter.secretName`) and `templates/secret.yaml` (create chart-managed Secret unless `azure.existingSecret` is set).
- CI in `.github/workflows/build-image-and-lint-chart.yml` validates both sides together: build image, run `ct lint`, then `ct install` in kind with the locally built image loaded and Helm image overrides.

## Key conventions in this codebase

- `azure.useManagedIdentity` is the switch that changes both chart rendering and app auth behavior:
  - `false`: tenant/client/secret are required and injected from Secret.
  - `true`: `AZURE_CLIENT_SECRET` is omitted and `AZURE_CLIENT_ID` may be optional.
- Expiry metrics use stable semantics in `collector.ts`: statuses are `ok` (>30d), `warning` (<=30d), `critical` (<=7d), `expired` (<0d), and `"no expiry"` is represented with sentinel value `99999` (Prometheus-friendly alternative to infinity).
- Metric names and label sets in `metrics.ts` are part of the contract; tests in `src/metrics.test.ts` and `src/collector.test.ts` assert against these exact names/labels.
- Helm templates consistently use helper templates (`entra-app-exporter.fullname`, `entra-app-exporter.labels`, `entra-app-exporter.secretName`) instead of duplicating names/selectors directly.
- Tilt usage is intentionally guarded: `Tiltfile` fails fast outside a `*dev` namespace and requires local `tilt-values.yaml` for Azure values.
