{{/*
Expand the name of the chart.
*/}}
{{- define "workload-fixer.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "workload-fixer.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "workload-fixer.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "workload-fixer.labels" -}}
helm.sh/chart: {{ include "workload-fixer.chart" . }}
{{ include "workload-fixer.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "workload-fixer.selectorLabels" -}}
app.kubernetes.io/name: {{ include "workload-fixer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "workload-fixer.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "workload-fixer.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Namespace to watch: defaults to release namespace.
*/}}
{{- define "workload-fixer.watchNamespace" -}}
{{- if and .Values.rbac.clusterScoped (empty .Values.watcher.namespace) -}}
{{- "" -}}
{{- else -}}
{{- default .Release.Namespace .Values.watcher.namespace -}}
{{- end -}}
{{- end }}
