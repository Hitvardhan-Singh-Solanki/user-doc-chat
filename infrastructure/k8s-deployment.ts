import * as pulumi from '@pulumi/pulumi';
import * as k8s from '@pulumi/kubernetes';

// Get configuration
const config = new pulumi.Config();
const environment = config.get('environment') || 'prod';
const domain = config.get('domain') || 'user-doc-chat.com';

// Get infrastructure outputs
const vpcId = new pulumi.StackReference('infrastructure').getOutput('vpcId');
const clusterName = new pulumi.StackReference('infrastructure').getOutput(
  'clusterName',
);
const databaseEndpoint = new pulumi.StackReference('infrastructure').getOutput(
  'databaseEndpoint',
);
const databasePassword = new pulumi.StackReference('infrastructure').getOutput(
  'databasePassword',
);
const redisEndpoint = new pulumi.StackReference('infrastructure').getOutput(
  'redisEndpoint',
);
const redisPassword = new pulumi.StackReference('infrastructure').getOutput(
  'redisPassword',
);
const bucketName = new pulumi.StackReference('infrastructure').getOutput(
  'bucketName',
);

// Create Kubernetes provider
const k8sProvider = new k8s.Provider('k8s-provider', {
  kubeconfig: new pulumi.StackReference('infrastructure').getOutput(
    'clusterKubeconfig',
  ),
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

// Create secrets
const appSecrets = new k8s.core.v1.Secret(
  `app-secrets-${environment}`,
  {
    metadata: {
      name: 'app-secrets',
      namespace: namespace.metadata.name,
    },
    type: 'Opaque',
    stringData: {
      'db-password': databasePassword,
      'redis-password': redisPassword,
      'jwt-secret': 'your-jwt-secret-here', // Should be generated securely
      'minio-access-key': 'your-minio-access-key',
      'minio-secret-key': 'your-minio-secret-key',
    },
  },
  { provider: k8sProvider },
);

const apiKeys = new k8s.core.v1.Secret(
  `api-keys-${environment}`,
  {
    metadata: {
      name: 'api-keys',
      namespace: namespace.metadata.name,
    },
    type: 'Opaque',
    stringData: {
      'openai-api-key': 'your-openai-api-key',
      'anthropic-api-key': 'your-anthropic-api-key',
      'serp-api-key': 'your-serp-api-key',
      'bing-search-api-key': 'your-bing-search-api-key',
    },
  },
  { provider: k8sProvider },
);

// ConfigMap for application configuration
const appConfig = new k8s.core.v1.ConfigMap(
  `app-config-${environment}`,
  {
    metadata: {
      name: 'app-config',
      namespace: namespace.metadata.name,
    },
    data: {
      NODE_ENV: 'production',
      PORT: '3000',
      LOG_LEVEL: 'info',
      DB_HOST: databaseEndpoint.apply((endpoint) => endpoint.split(':')[0]),
      DB_PORT: '5432',
      DB_NAME: 'user_doc_chat_prod',
      DB_USER: 'postgres',
      REDIS_HOST: redisEndpoint.apply((endpoint) => endpoint.split(':')[0]),
      REDIS_PORT: '6379',
      MINIO_ENDPOINT: 'minio-service',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      S3_BUCKET: bucketName,
      CORS_ORIGIN: `https://${domain}`,
      RATE_LIMIT_WINDOW_MS: '900000',
      RATE_LIMIT_MAX_REQUESTS: '100',
      PROMETHEUS_PORT: '9090',
      GRAFANA_PORT: '3001',
    },
  },
  { provider: k8sProvider },
);

// Main application deployment
const appDeployment = new k8s.apps.v1.Deployment(
  `user-doc-chat-app-${environment}`,
  {
    metadata: {
      name: `user-doc-chat-app-${environment}`,
      namespace: namespace.metadata.name,
      labels: {
        app: 'user-doc-chat',
        component: 'app',
        environment: environment,
      },
    },
    spec: {
      replicas: 3,
      selector: {
        matchLabels: {
          app: 'user-doc-chat',
          component: 'app',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'user-doc-chat',
            component: 'app',
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
                  name: 'http',
                },
              ],
              env: [
                {
                  name: 'NODE_ENV',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'NODE_ENV' },
                  },
                },
                {
                  name: 'PORT',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'PORT' },
                  },
                },
                {
                  name: 'LOG_LEVEL',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'LOG_LEVEL' },
                  },
                },
                {
                  name: 'DATABASE_URL',
                  value: pulumi.interpolate`postgresql://postgres:${databasePassword}@${databaseEndpoint}/user_doc_chat_prod?sslmode=require`,
                },
                {
                  name: 'DB_HOST',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'DB_HOST' },
                  },
                },
                {
                  name: 'DB_PORT',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'DB_PORT' },
                  },
                },
                {
                  name: 'DB_NAME',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'DB_NAME' },
                  },
                },
                {
                  name: 'DB_USER',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'DB_USER' },
                  },
                },
                {
                  name: 'DB_PASSWORD',
                  valueFrom: {
                    secretKeyRef: { name: 'app-secrets', key: 'db-password' },
                  },
                },
                {
                  name: 'REDIS_URL',
                  value: pulumi.interpolate`redis://:${redisPassword}@${redisEndpoint}`,
                },
                {
                  name: 'REDIS_HOST',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'REDIS_HOST' },
                  },
                },
                {
                  name: 'REDIS_PORT',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'REDIS_PORT' },
                  },
                },
                {
                  name: 'REDIS_PASSWORD',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'app-secrets',
                      key: 'redis-password',
                    },
                  },
                },
                {
                  name: 'JWT_SECRET',
                  valueFrom: {
                    secretKeyRef: { name: 'app-secrets', key: 'jwt-secret' },
                  },
                },
                { name: 'JWT_EXPIRES_IN', value: '3600' },
                {
                  name: 'OPENAI_API_KEY',
                  valueFrom: {
                    secretKeyRef: { name: 'api-keys', key: 'openai-api-key' },
                  },
                },
                {
                  name: 'ANTHROPIC_API_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'api-keys',
                      key: 'anthropic-api-key',
                    },
                  },
                },
                {
                  name: 'SERP_API_KEY',
                  valueFrom: {
                    secretKeyRef: { name: 'api-keys', key: 'serp-api-key' },
                  },
                },
                {
                  name: 'BING_SEARCH_API_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'api-keys',
                      key: 'bing-search-api-key',
                    },
                  },
                },
                {
                  name: 'BING_SEARCH_ENDPOINT',
                  value: 'https://api.bing.microsoft.com/v7.0/search',
                },
                {
                  name: 'MINIO_ENDPOINT',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'MINIO_ENDPOINT',
                    },
                  },
                },
                {
                  name: 'MINIO_PORT',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'MINIO_PORT' },
                  },
                },
                {
                  name: 'MINIO_ACCESS_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'app-secrets',
                      key: 'minio-access-key',
                    },
                  },
                },
                {
                  name: 'MINIO_SECRET_KEY',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'app-secrets',
                      key: 'minio-secret-key',
                    },
                  },
                },
                {
                  name: 'MINIO_USE_SSL',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'MINIO_USE_SSL',
                    },
                  },
                },
                {
                  name: 'S3_BUCKET',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'S3_BUCKET' },
                  },
                },
                {
                  name: 'CORS_ORIGIN',
                  valueFrom: {
                    configMapKeyRef: { name: 'app-config', key: 'CORS_ORIGIN' },
                  },
                },
                {
                  name: 'RATE_LIMIT_WINDOW_MS',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'RATE_LIMIT_WINDOW_MS',
                    },
                  },
                },
                {
                  name: 'RATE_LIMIT_MAX_REQUESTS',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'RATE_LIMIT_MAX_REQUESTS',
                    },
                  },
                },
                {
                  name: 'PROMETHEUS_PORT',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'PROMETHEUS_PORT',
                    },
                  },
                },
                {
                  name: 'GRAFANA_PORT',
                  valueFrom: {
                    configMapKeyRef: {
                      name: 'app-config',
                      key: 'GRAFANA_PORT',
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

// Service for the application
const appService = new k8s.core.v1.Service(
  `app-service-${environment}`,
  {
    metadata: {
      name: 'app-service',
      namespace: namespace.metadata.name,
      labels: {
        app: 'user-doc-chat',
        component: 'app',
      },
    },
    spec: {
      selector: {
        app: 'user-doc-chat',
        component: 'app',
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

// Ingress for external access
const ingress = new k8s.networking.v1.Ingress(
  `user-doc-chat-ingress-${environment}`,
  {
    metadata: {
      name: 'user-doc-chat-ingress',
      namespace: namespace.metadata.name,
      annotations: {
        'kubernetes.io/ingress.class': 'alb',
        'alb.ingress.kubernetes.io/scheme': 'internet-facing',
        'alb.ingress.kubernetes.io/target-type': 'ip',
        'alb.ingress.kubernetes.io/ssl-redirect': '443',
        'alb.ingress.kubernetes.io/certificate-arn': new pulumi.StackReference(
          'infrastructure',
        ).getOutput('certificateArn'),
      },
    },
    spec: {
      rules: [
        {
          host: domain,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'app-service',
                    port: {
                      number: 3000,
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

// Export important values
export const namespaceName = namespace.metadata.name;
export const appServiceName = appService.metadata.name;
export const ingressName = ingress.metadata.name;
