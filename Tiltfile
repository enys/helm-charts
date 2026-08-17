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

# Map chart name -> (app source dir, image repository)
chart_config = {
  'entra-app-exporter': ('apps/entra-app-exporter', 'ghcr.io/enys/entra-app-exporter'),
  'workload-fixer':     ('apps/workload-fixer',     'ghcr.io/enys/workload-fixer'),
}

if chart_name not in chart_config:
  fail('Unknown chart "{}". Supported: {}'.format(chart_name, ', '.join(chart_config.keys())))

app_dir, image_ref = chart_config[chart_name]
chart_path = 'charts/' + chart_name
release_name = chart_name + '-tilt'

local_values_file = 'tilt-values.yaml'
if not os.path.exists(local_values_file):
  fail('Missing tilt-values.yaml. Provide required Helm values there.')

# Build the Docker image locally.
# For local clusters (kind/docker-desktop/minikube) Tilt skips the push automatically.
# For remote clusters, set TILT_PUSH=false in your environment or login with:
#   echo <PAT> | docker login ghcr.io -u <username> --password-stdin
push = os.environ.get('TILT_PUSH', '') != 'false'
docker_build(image_ref, app_dir, push=push)

helm_resource(
  name=chart_name,
  release_name=release_name,
  chart=chart_path,
  flags=['--values=' + local_values_file],
  deps=[chart_path, local_values_file],
  image_deps=[image_ref],
  image_keys=[('image.repository', 'image.tag')],
)

k8s_resource(
  workload=chart_name,
  port_forwards=['9090:9090'],
)
