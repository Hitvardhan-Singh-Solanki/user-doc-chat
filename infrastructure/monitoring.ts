import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';

// Get configuration
const config = new pulumi.Config();
const environment = config.get('environment') || 'prod';

// Create Kubernetes provider
const k8sProvider = new k8s.Provider('k8s-provider', {
  kubeconfig: 'dummy-kubeconfig', // This will be replaced with actual kubeconfig
});

// Create namespace
const prometheusNamespace = new k8s.core.v1.Namespace(
  `monitoring-${environment}`,
  {
    metadata: {
      name: `monitoring-${environment}`,
      labels: {
        name: `monitoring-${environment}`,
        environment: environment,
      },
    },
  },
  { provider: k8sProvider },
);

// Prometheus ConfigMap
const prometheusConfig = new k8s.core.v1.ConfigMap(
  `prometheus-config-${environment}`,
  {
    metadata: {
      name: 'prometheus-config',
      namespace: prometheusNamespace.metadata.name,
    },
    data: {
      'prometheus.yml': `
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\\d+)?;(\\d+)
        replacement: $1:$2
        target_label: __address__
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: kubernetes_namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: kubernetes_pod_name
`,
    },
  },
  { provider: k8sProvider },
);

// Prometheus Deployment
const prometheusDeployment = new k8s.apps.v1.Deployment(
  `prometheus-deployment-${environment}`,
  {
    metadata: {
      name: 'prometheus',
      namespace: prometheusNamespace.metadata.name,
      labels: {
        app: 'prometheus',
        environment: environment,
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: 'prometheus',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'prometheus',
            environment: environment,
          },
        },
        spec: {
          containers: [
            {
              name: 'prometheus',
              image: 'prom/prometheus:latest',
              args: [
                '--config.file=/etc/prometheus/prometheus.yml',
                '--storage.tsdb.path=/prometheus/',
                '--web.console.libraries=/etc/prometheus/console_libraries',
                '--web.console.templates=/etc/prometheus/consoles',
                '--storage.tsdb.retention.time=200h',
                '--web.enable-lifecycle',
              ],
              ports: [
                {
                  containerPort: 9090,
                },
              ],
              volumeMounts: [
                {
                  name: 'prometheus-config',
                  mountPath: '/etc/prometheus/',
                },
                {
                  name: 'prometheus-storage',
                  mountPath: '/prometheus/',
                },
              ],
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '250m',
                },
                limits: {
                  memory: '1Gi',
                  cpu: '500m',
                },
              },
            },
          ],
          volumes: [
            {
              name: 'prometheus-config',
              configMap: {
                name: 'prometheus-config',
              },
            },
            {
              name: 'prometheus-storage',
              emptyDir: {},
            },
          ],
        },
      },
    },
  },
  { provider: k8sProvider },
);

// Prometheus Service
const prometheusService = new k8s.core.v1.Service(
  `prometheus-service-${environment}`,
  {
    metadata: {
      name: 'prometheus-service',
      namespace: prometheusNamespace.metadata.name,
      labels: {
        app: 'prometheus',
        environment: environment,
      },
    },
    spec: {
      selector: {
        app: 'prometheus',
      },
      ports: [
        {
          port: 9090,
          targetPort: 9090,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
    },
  },
  { provider: k8sProvider },
);

// Grafana ConfigMap
const grafanaConfig = new k8s.core.v1.ConfigMap(
  `grafana-config-${environment}`,
  {
    metadata: {
      name: 'grafana-config',
      namespace: prometheusNamespace.metadata.name,
    },
    data: {
      'grafana.ini': `
[server]
http_port = 3000
root_url = %(protocol)s://%(domain)s:%(http_port)s/

[security]
admin_user = admin
admin_password = admin

[users]
allow_sign_up = false
allow_org_create = false

[log]
mode = console
level = info

[auth.anonymous]
enabled = true
org_name = Main Org.
org_role = Viewer
`,
    },
  },
  { provider: k8sProvider },
);

// Grafana Deployment
const grafanaDeployment = new k8s.apps.v1.Deployment(
  `grafana-deployment-${environment}`,
  {
    metadata: {
      name: 'grafana',
      namespace: prometheusNamespace.metadata.name,
      labels: {
        app: 'grafana',
        environment: environment,
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: 'grafana',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'grafana',
            environment: environment,
          },
        },
        spec: {
          containers: [
            {
              name: 'grafana',
              image: 'grafana/grafana:latest',
              ports: [
                {
                  containerPort: 3000,
                },
              ],
              env: [
                {
                  name: 'GF_SECURITY_ADMIN_PASSWORD',
                  value: 'admin',
                },
              ],
              volumeMounts: [
                {
                  name: 'grafana-config',
                  mountPath: '/etc/grafana/grafana.ini',
                  subPath: 'grafana.ini',
                },
                {
                  name: 'grafana-storage',
                  mountPath: '/var/lib/grafana',
                },
              ],
              resources: {
                requests: {
                  memory: '256Mi',
                  cpu: '100m',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '200m',
                },
              },
            },
          ],
          volumes: [
            {
              name: 'grafana-config',
              configMap: {
                name: 'grafana-config',
              },
            },
            {
              name: 'grafana-storage',
              emptyDir: {},
            },
          ],
        },
      },
    },
  },
  { provider: k8sProvider },
);

// Grafana Service
const grafanaService = new k8s.core.v1.Service(
  `grafana-service-${environment}`,
  {
    metadata: {
      name: 'grafana-service',
      namespace: prometheusNamespace.metadata.name,
      labels: {
        app: 'grafana',
        environment: environment,
      },
    },
    spec: {
      selector: {
        app: 'grafana',
      },
      ports: [
        {
          port: 3000,
          targetPort: 3000,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
    },
  },
  { provider: k8sProvider },
);

// Export all outputs
export {
  prometheusNamespace,
  prometheusConfig,
  prometheusDeployment,
  prometheusService,
  grafanaConfig,
  grafanaDeployment,
  grafanaService,
};
