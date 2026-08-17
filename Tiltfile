version_settings(constraint='>=0.30.8')

load('ext://helm_resource', 'helm_resource')

ctx = k8s_context()
allow_k8s_contexts(ctx)

if not k8s_namespace().endswith('dev'):
  fail('You are not targeting a dev namespace')

# Select which chart to deploy:
#   tilt up -- --chart=workload-fixer
#   tilt up -- --chart=entra-app-exporter  (default)
config.define_string('chart', args=False, usage='Chart to deploy (entra-app-exporter or workload-fixer)')
cfg = config.parse()
chart_name = cfg.get('chart', 'entra-app-exporter')

supported_charts = ['entra-app-exporter', 'workload-fixer']
if chart_name not in supported_charts:
  fail('Unknown chart "{}". Supported: {}'.format(chart_name, ', '.join(supported_charts)))

chart_path = 'charts/' + chart_name
release_name = chart_name + '-tilt'

local_values_file = 'tilt-values.yaml'
if not os.path.exists(local_values_file):
  fail('Missing tilt-values.yaml. Provide required Helm values there.')

helm_resource(
  name=chart_name,
  release_name=release_name,
  chart=chart_path,
  flags=['--values=' + local_values_file],
  deps=[chart_path, local_values_file],
)

k8s_resource(
  workload=chart_name,
  port_forwards=['9090:9090'],
)
