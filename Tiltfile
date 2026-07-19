version_settings(constraint='>=0.30.8')

load('ext://helm_resource', 'helm_resource')

ctx = k8s_context()
allow_k8s_contexts(ctx)

if not k8s_namespace().endswith('dev'):
  fail('You are not targeting a dev namespace')

chart_path = 'charts/entra-app-exporter'
release_name = 'entra-app-exporter-tilt'
workload_name = 'entra-app-exporter'

local_values_file = 'tilt-values.yaml'
if not os.path.exists(local_values_file):
  fail('Missing tilt-values.yaml. Provide required Helm values there.')

helm_resource(
  name='entra-app-exporter',
  release_name=release_name,
  chart=chart_path,
  flags=['--values=' + local_values_file],
  deps=[chart_path, local_values_file],
)

k8s_resource(
  workload=workload_name,
  port_forwards=['9090:9090'],
)
