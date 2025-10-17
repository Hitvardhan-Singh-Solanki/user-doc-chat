import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';

// Get configuration
const config = new pulumi.Config();
const environment = config.get('environment') || 'prod';

// Get infrastructure outputs
const k8sProvider = new k8s.Provider('k8s-provider', {
  kubeconfig: new pulumi.StackReference('infrastructure').getOutput(
    'clusterKubeconfig',
  ),
});

const namespace = new k8s.core.v1.Namespace(
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
      namespace: namespace.metadata.name,
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
  
  - job_name: 'user-doc-chat-app'
    kubernetes_sd_configs:
      - role: endpoints
        namespaces:
          names:
            - user-doc-chat-${environment}
    relabel_configs:
      - source_labels: [__meta_kubernetes_service_name]
        action: keep
        regex: app-service
      - source_labels: [__meta_kubernetes_endpoint_port_name]
        action: keep
        regex: http
    metrics_path: /metrics
    scrape_interval: 30s
`,
    },
  },
  { provider: k8sProvider },
);

// Prometheus Deployment
const prometheusDeployment = new k8s.apps.v1.Deployment(
  `prometheus-${environment}`,
  {
    metadata: {
      name: 'prometheus',
      namespace: namespace.metadata.name,
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
          },
        },
        spec: {
          containers: [
            {
              name: 'prometheus',
              image: 'prom/prometheus:latest',
              ports: [
                {
                  containerPort: 9090,
                  name: 'web',
                },
              ],
              args: [
                '--config.file=/etc/prometheus/prometheus.yml',
                '--storage.tsdb.path=/prometheus/',
                '--web.console.libraries=/etc/prometheus/console_libraries',
                '--web.console.templates=/etc/prometheus/consoles',
                '--web.enable-lifecycle',
              ],
              volumeMounts: [
                {
                  name: 'prometheus-config',
                  mountPath: '/etc/prometheus',
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
      namespace: namespace.metadata.name,
      labels: {
        app: 'prometheus',
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
      namespace: namespace.metadata.name,
    },
    data: {
      'grafana.ini': `
[server]
http_port = 3000
root_url = %(protocol)s://%(domain)s:%(http_port)s/

[security]
admin_user = admin
admin_password = admin

[database]
type = sqlite3
path = grafana.db

[users]
allow_sign_up = false
auto_assign_org = true
auto_assign_org_role = Viewer

[log]
mode = console
level = info
`,
    },
  },
  { provider: k8sProvider },
);

// Grafana Deployment
const grafanaDeployment = new k8s.apps.v1.Deployment(
  `grafana-${environment}`,
  {
    metadata: {
      name: 'grafana',
      namespace: namespace.metadata.name,
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
                  name: 'http',
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
              ],
              resources: {
                requests: {
                  memory: '256Mi',
                  cpu: '100m',
                },
                limits: {
                  memory: '512Mi',
                  cpu: '250m',
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
      namespace: namespace.metadata.name,
      labels: {
        app: 'grafana',
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

// Export important values
export const monitoringNamespace = namespace.metadata.name;
export const prometheusServiceName = prometheusService.metadata.name;
export const grafanaServiceName = grafanaService.metadata.name;
