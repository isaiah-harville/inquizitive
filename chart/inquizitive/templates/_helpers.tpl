{{- define "inquizitive.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "inquizitive.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "inquizitive.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* A volume is needed when using SQLite (no database URL/secret) or local image storage. */}}
{{- define "inquizitive.needsVolume" -}}
{{- $sqlite := and (not .Values.database.url) (not .Values.database.existingSecret) -}}
{{- if and .Values.persistence.enabled (or $sqlite (eq .Values.storage.driver "fs")) -}}true{{- end -}}
{{- end -}}
