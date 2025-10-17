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
const namespace = new k8s.core.v1.Namespace(
  `user-doc-chat-${environment}`,
  {
    metadata: {
      name: `user-doc-chat-${environment}`,
      labels: {
        name: `user-doc-chat-${environment}`,
        environment: environment,
      },
    },
  },
  { provider: k8sProvider },
);

// App secrets
const appSecrets = new k8s.core.v1.Secret(
  `app-secrets-${environment}`,
  {
    metadata: {
      name: 'app-secrets',
      namespace: namespace.metadata.name,
    },
    type: 'Opaque',
    stringData: {
      DB_PASSWORD: 'dummy-db-password',
      REDIS_PASSWORD: 'dummy-redis-password',
      JWT_SECRET: 'dummy-jwt-secret',
    },
  },
  { provider: k8sProvider },
);

// API keys secret
const apiKeys = new k8s.core.v1.Secret(
  `api-keys-${environment}`,
  {
    metadata: {
      name: 'api-keys',
      namespace: namespace.metadata.name,
    },
    type: 'Opaque',
    stringData: {
      OPENAI_API_KEY: 'dummy-openai-key',
      HUGGINGFACE_API_KEY: 'dummy-huggingface-key',
    },
  },
  { provider: k8sProvider },
);

// App config
const appConfig = new k8s.core.v1.ConfigMap(
  `app-config-${environment}`,
  {
    metadata: {
      name: 'app-config',
      namespace: namespace.metadata.name,
    },
    data: {
      NODE_ENV: environment,
      PORT: '3000',
      LOG_LEVEL: 'info',
      DB_HOST: 'dummy-db-host',
      REDIS_HOST: 'dummy-redis-host',
      S3_BUCKET: 'dummy-bucket',
    },
  },
  { provider: k8sProvider },
);

// App deployment
const appDeployment = new k8s.apps.v1.Deployment(
  `app-deployment-${environment}`,
  {
    metadata: {
      name: 'app-deployment',
      namespace: namespace.metadata.name,
      labels: {
        app: 'user-doc-chat',
        environment: environment,
      },
    },
    spec: {
      replicas: 2,
      selector: {
        matchLabels: {
          app: 'user-doc-chat',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'user-doc-chat',
            environment: environment,
          },
        },
        spec: {
          containers: [
            {
              name: 'app',
              image: 'user-doc-chat:latest',
              ports: [
                {
                  containerPort: 3000,
                },
              ],
              env: [
                {
                  name: 'NODE_ENV',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'NODE_ENV',
                    },
                  },
                },
                {
                  name: 'PORT',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'PORT',
                    },
                  },
                },
                {
                  name: 'DB_PASSWORD',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'app-secrets',
                      key: 'DB_PASSWORD',
                    },
                  },
                },
                {
                  name: 'REDIS_PASSWORD',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'app-secrets',
                      key: 'REDIS_PASSWORD',
                    },
                  },
                },
                {
                  name: 'OPENAI_API_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'api-keys',
                      key: 'OPENAI_API_KEY',
                    },
                  },
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
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 3000,
                },
                initialDelaySeconds: 30,
                periodSeconds: 10,
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 3000,
                },
                initialDelaySeconds: 5,
                periodSeconds: 5,
              },
            },
          ],
        },
      },
    },
  },
  { provider: k8sProvider },
);

// App service
const appService = new k8s.core.v1.Service(
  `app-service-${environment}`,
  {
    metadata: {
      name: 'app-service',
      namespace: namespace.metadata.name,
      labels: {
        app: 'user-doc-chat',
        environment: environment,
      },
    },
    spec: {
      selector: {
        app: 'user-doc-chat',
      },
      ports: [
        {
          port: 80,
          targetPort: 3000,
          protocol: 'TCP',
        },
      ],
      type: 'ClusterIP',
    },
  },
  { provider: k8sProvider },
);

// Ingress
const ingress = new k8s.networking.v1.Ingress(
  `app-ingress-${environment}`,
  {
    metadata: {
      name: 'app-ingress',
      namespace: namespace.metadata.name,
      annotations: {
        'kubernetes.io/ingress.class': 'alb',
        'alb.ingress.kubernetes.io/scheme': 'internet-facing',
        'alb.ingress.kubernetes.io/target-type': 'ip',
        'alb.ingress.kubernetes.io/certificate-arn': 'dummy-cert-arn',
        'alb.ingress.kubernetes.io/ssl-redirect': '443',
      },
    },
    spec: {
      rules: [
        {
          host: 'user-doc-chat.com',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'app-service',
                    port: {
                      number: 80,
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  },
  { provider: k8sProvider },
);

// Export all outputs
export {
  namespace,
  appSecrets,
  apiKeys,
  appConfig,
  appDeployment,
  appService,
  ingress,
};
