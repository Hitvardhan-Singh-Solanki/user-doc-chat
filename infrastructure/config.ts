import {
  InfrastructureConfig,
  DatabaseConfig,
  RedisConfig,
  EKSConfig,
  AppConfig,
} from './types';

const getEnvironmentConfig = () => ({
  environment: process.env.ENVIRONMENT || 'prod',
  domain: process.env.DOMAIN || 'user-doc-chat.com',
});

const getNetworkConfig = () => ({
  vpcCidr: process.env.VPC_CIDR || '10.0.0.0/16',
  publicSubnet1Cidr: process.env.PUBLIC_SUBNET_1_CIDR || '10.0.1.0/24',
  publicSubnet2Cidr: process.env.PUBLIC_SUBNET_2_CIDR || '10.0.2.0/24',
  privateSubnet1Cidr: process.env.PRIVATE_SUBNET_1_CIDR || '10.0.3.0/24',
  privateSubnet2Cidr: process.env.PRIVATE_SUBNET_2_CIDR || '10.0.4.0/24',
  availabilityZone1: process.env.AZ_1 || 'us-west-2a',
  availabilityZone2: process.env.AZ_2 || 'us-west-2b',
});

export const getInfrastructureConfig = (): InfrastructureConfig => ({
  ...getEnvironmentConfig(),
  ...getNetworkConfig(),
});

const getDatabaseEngineConfig = () => ({
  engine: process.env.DB_ENGINE || 'postgres',
  engineVersion: process.env.DB_ENGINE_VERSION || '15.4',
  instanceClass: process.env.DB_INSTANCE_CLASS || 'db.t3.micro',
});

const getDatabaseStorageConfig = () => ({
  allocatedStorage: parseInt(process.env.DB_ALLOCATED_STORAGE || '20'),
  storageType: process.env.DB_STORAGE_TYPE || 'gp2',
  dbName: process.env.DB_NAME || 'userdocchat',
  username: process.env.DB_USERNAME || 'postgres',
});

const getDatabaseBackupConfig = () => ({
  backupRetentionPeriod: parseInt(process.env.DB_BACKUP_RETENTION || '7'),
  backupWindow: process.env.DB_BACKUP_WINDOW || '03:00-04:00',
  maintenanceWindow: process.env.DB_MAINTENANCE_WINDOW || 'sun:04:00-sun:05:00',
});

export const getDatabaseConfig = (): DatabaseConfig => ({
  ...getDatabaseEngineConfig(),
  ...getDatabaseStorageConfig(),
  ...getDatabaseBackupConfig(),
});

export const getRedisConfig = (): RedisConfig => ({
  nodeType: process.env.REDIS_NODE_TYPE || 'cache.t3.micro',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  parameterGroupName: process.env.REDIS_PARAMETER_GROUP || 'default.redis7',
  numCacheClusters: parseInt(process.env.REDIS_NUM_CACHE_CLUSTERS || '1'),
  atRestEncryptionEnabled: process.env.REDIS_AT_REST_ENCRYPTION === 'true',
  transitEncryptionEnabled: process.env.REDIS_TRANSIT_ENCRYPTION === 'true',
});

export const getEKSConfig = (): EKSConfig => ({
  clusterRoleArn:
    process.env.EKS_CLUSTER_ROLE_ARN ||
    'arn:aws:iam::123456789012:role/eks-cluster-role',
  nodeRoleArn:
    process.env.EKS_NODE_ROLE_ARN ||
    'arn:aws:iam::123456789012:role/eks-node-role',
  desiredSize: parseInt(process.env.EKS_DESIRED_SIZE || '2'),
  maxSize: parseInt(process.env.EKS_MAX_SIZE || '4'),
  minSize: parseInt(process.env.EKS_MIN_SIZE || '1'),
  instanceTypes: (process.env.EKS_INSTANCE_TYPES || 't3.medium').split(','),
});

export const getAppConfig = (): AppConfig => ({
  replicas: parseInt(process.env.APP_REPLICAS || '2'),
  image: process.env.APP_IMAGE || 'user-doc-chat:latest',
  port: parseInt(process.env.APP_PORT || '3000'),
  memoryRequest: process.env.APP_MEMORY_REQUEST || '512Mi',
  memoryLimit: process.env.APP_MEMORY_LIMIT || '1Gi',
  cpuRequest: process.env.APP_CPU_REQUEST || '250m',
  cpuLimit: process.env.APP_CPU_LIMIT || '500m',
});
