export interface InfrastructureConfig {
  environment: string;
  domain: string;
  vpcCidr: string;
  publicSubnet1Cidr: string;
  publicSubnet2Cidr: string;
  privateSubnet1Cidr: string;
  privateSubnet2Cidr: string;
  availabilityZone1: string;
  availabilityZone2: string;
}

export interface DatabaseConfig {
  engine: string;
  engineVersion: string;
  instanceClass: string;
  allocatedStorage: number;
  storageType: string;
  dbName: string;
  username: string;
  backupRetentionPeriod: number;
  backupWindow: string;
  maintenanceWindow: string;
}

export interface RedisConfig {
  nodeType: string;
  port: number;
  parameterGroupName: string;
  numCacheClusters: number;
  atRestEncryptionEnabled: boolean;
  transitEncryptionEnabled: boolean;
}

export interface EKSConfig {
  clusterRoleArn: string;
  nodeRoleArn: string;
  desiredSize: number;
  maxSize: number;
  minSize: number;
  instanceTypes: string[];
}

export interface AppConfig {
  replicas: number;
  image: string;
  port: number;
  memoryRequest: string;
  memoryLimit: string;
  cpuRequest: string;
  cpuLimit: string;
}
