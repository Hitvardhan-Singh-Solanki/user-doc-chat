import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as random from '@pulumi/random';
import {
  getInfrastructureConfig,
  getDatabaseConfig,
  getRedisConfig,
  getEKSConfig,
} from './config';

// Get configuration
const infrastructureConfig = getInfrastructureConfig();
const databaseConfig = getDatabaseConfig();
const redisConfig = getRedisConfig();
const eksConfig = getEKSConfig();
const environment = infrastructureConfig.environment;

// VPC
const vpc = new aws.ec2.Vpc(`user-doc-chat-vpc-${environment}`, {
  cidrBlock: infrastructureConfig.vpcCidr,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `user-doc-chat-vpc-${environment}`,
    Environment: environment,
  },
});

// Public Subnets
const publicSubnet1 = new aws.ec2.Subnet(
  `user-doc-chat-public-1-${environment}`,
  {
    vpcId: vpc.id,
    cidrBlock: infrastructureConfig.publicSubnet1Cidr,
    availabilityZone: infrastructureConfig.availabilityZone1,
    mapPublicIpOnLaunch: true,
    tags: {
      Name: `user-doc-chat-public-1-${environment}`,
      Environment: environment,
    },
  },
);

const publicSubnet2 = new aws.ec2.Subnet(
  `user-doc-chat-public-2-${environment}`,
  {
    vpcId: vpc.id,
    cidrBlock: infrastructureConfig.publicSubnet2Cidr,
    availabilityZone: infrastructureConfig.availabilityZone2,
    mapPublicIpOnLaunch: true,
    tags: {
      Name: `user-doc-chat-public-2-${environment}`,
      Environment: environment,
    },
  },
);

// Private Subnets
const privateSubnet1 = new aws.ec2.Subnet(
  `user-doc-chat-private-1-${environment}`,
  {
    vpcId: vpc.id,
    cidrBlock: infrastructureConfig.privateSubnet1Cidr,
    availabilityZone: infrastructureConfig.availabilityZone1,
    tags: {
      Name: `user-doc-chat-private-1-${environment}`,
      Environment: environment,
    },
  },
);

const privateSubnet2 = new aws.ec2.Subnet(
  `user-doc-chat-private-2-${environment}`,
  {
    vpcId: vpc.id,
    cidrBlock: infrastructureConfig.privateSubnet2Cidr,
    availabilityZone: infrastructureConfig.availabilityZone2,
    tags: {
      Name: `user-doc-chat-private-2-${environment}`,
      Environment: environment,
    },
  },
);

// Internet Gateway
const internetGateway = new aws.ec2.InternetGateway(
  `user-doc-chat-igw-${environment}`,
  {
    vpcId: vpc.id,
    tags: {
      Name: `user-doc-chat-igw-${environment}`,
      Environment: environment,
    },
  },
);

// Security Groups
const webSecurityGroup = new aws.ec2.SecurityGroup(
  `user-doc-chat-web-sg-${environment}`,
  {
    name: `user-doc-chat-web-sg-${environment}`,
    description: 'Security group for web tier',
    vpcId: vpc.id,
    ingress: [
      {
        fromPort: 80,
        toPort: 80,
        protocol: 'tcp',
        cidrBlocks: ['0.0.0.0/0'],
      },
      {
        fromPort: 443,
        toPort: 443,
        protocol: 'tcp',
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
    egress: [
      {
        fromPort: 0,
        toPort: 0,
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
    tags: {
      Name: `user-doc-chat-web-sg-${environment}`,
      Environment: environment,
    },
  },
);

const dbSecurityGroup = new aws.ec2.SecurityGroup(
  `user-doc-chat-db-sg-${environment}`,
  {
    name: `user-doc-chat-db-sg-${environment}`,
    description: 'Security group for database tier',
    vpcId: vpc.id,
    ingress: [
      {
        fromPort: 5432,
        toPort: 5432,
        protocol: 'tcp',
        securityGroups: [webSecurityGroup.id],
      },
    ],
    tags: {
      Name: `user-doc-chat-db-sg-${environment}`,
      Environment: environment,
    },
  },
);

const redisSecurityGroup = new aws.ec2.SecurityGroup(
  `user-doc-chat-redis-sg-${environment}`,
  {
    name: `user-doc-chat-redis-sg-${environment}`,
    description: 'Security group for Redis cache',
    vpcId: vpc.id,
    ingress: [
      {
        fromPort: 6379,
        toPort: 6379,
        protocol: 'tcp',
        securityGroups: [webSecurityGroup.id],
      },
    ],
    tags: {
      Name: `user-doc-chat-redis-sg-${environment}`,
      Environment: environment,
    },
  },
);

// EKS Cluster
const cluster = new aws.eks.Cluster(`user-doc-chat-cluster-${environment}`, {
  name: `user-doc-chat-cluster-${environment}`,
  roleArn: eksConfig.clusterRoleArn,
  vpcConfig: {
    subnetIds: [
      publicSubnet1.id,
      publicSubnet2.id,
      privateSubnet1.id,
      privateSubnet2.id,
    ],
  },
  tags: {
    Name: `user-doc-chat-cluster-${environment}`,
    Environment: environment,
  },
});

// EKS Node Group
const nodeGroup = new aws.eks.NodeGroup(
  `user-doc-chat-node-group-${environment}`,
  {
    clusterName: cluster.name,
    nodeGroupName: `user-doc-chat-node-group-${environment}`,
    nodeRoleArn: eksConfig.nodeRoleArn,
    subnetIds: [privateSubnet1.id, privateSubnet2.id],
    scalingConfig: {
      desiredSize: eksConfig.desiredSize,
      maxSize: eksConfig.maxSize,
      minSize: eksConfig.minSize,
    },
    instanceTypes: eksConfig.instanceTypes,
    tags: {
      Name: `user-doc-chat-node-group-${environment}`,
      Environment: environment,
    },
  },
);

// RDS Database
const dbPassword = new random.RandomPassword(
  `user-doc-chat-db-password-${environment}`,
  {
    length: 32,
    special: true,
  },
);

const dbSubnetGroup = new aws.rds.SubnetGroup(
  `user-doc-chat-db-subnet-group-${environment}`,
  {
    name: `user-doc-chat-db-subnet-group-${environment}`,
    subnetIds: [privateSubnet1.id, privateSubnet2.id],
    tags: {
      Name: `user-doc-chat-db-subnet-group-${environment}`,
      Environment: environment,
    },
  },
);

const database = new aws.rds.Instance(`user-doc-chat-db-${environment}`, {
  identifier: `user-doc-chat-db-${environment}`,
  engine: databaseConfig.engine,
  engineVersion: databaseConfig.engineVersion,
  instanceClass: databaseConfig.instanceClass,
  allocatedStorage: databaseConfig.allocatedStorage,
  storageType: databaseConfig.storageType,
  dbName: databaseConfig.dbName,
  username: databaseConfig.username,
  password: dbPassword.result,
  dbSubnetGroupName: dbSubnetGroup.name,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  backupRetentionPeriod: databaseConfig.backupRetentionPeriod,
  backupWindow: databaseConfig.backupWindow,
  maintenanceWindow: databaseConfig.maintenanceWindow,
  skipFinalSnapshot: true,
  tags: {
    Name: `user-doc-chat-db-${environment}`,
    Environment: environment,
  },
});

// Redis Cache
const redisPasswordResource = new random.RandomPassword(
  `user-doc-chat-redis-password-${environment}`,
  {
    length: 32,
    special: true,
  },
);

const redis = new aws.elasticache.ReplicationGroup(
  `user-doc-chat-redis-${environment}`,
  {
    replicationGroupId: `user-doc-chat-redis-${environment}`,
    description: `Redis cache for user-doc-chat-${environment}`,
    nodeType: redisConfig.nodeType,
    port: redisConfig.port,
    parameterGroupName: redisConfig.parameterGroupName,
    numCacheClusters: redisConfig.numCacheClusters,
    authToken: redisPasswordResource.result,
    atRestEncryptionEnabled: redisConfig.atRestEncryptionEnabled,
    transitEncryptionEnabled: redisConfig.transitEncryptionEnabled,
    subnetGroupName: 'default',
    securityGroupIds: [redisSecurityGroup.id],
    tags: {
      Name: `user-doc-chat-redis-${environment}`,
      Environment: environment,
    },
  },
);

// S3 Bucket
const bucket = new aws.s3.Bucket(`user-doc-chat-bucket-${environment}`, {
  bucket: `user-doc-chat-bucket-${environment}`,
  tags: {
    Name: `user-doc-chat-bucket-${environment}`,
    Environment: environment,
  },
});

// SSL Certificate
const certificate = new aws.acm.Certificate(
  `user-doc-chat-cert-${environment}`,
  {
    domainName: infrastructureConfig.domain,
    validationMethod: 'DNS',
    tags: {
      Name: `user-doc-chat-cert-${environment}`,
      Environment: environment,
    },
  },
);

// ALB
const alb = new aws.lb.LoadBalancer(`user-doc-chat-alb-${environment}`, {
  name: `user-doc-chat-alb-${environment}`,
  loadBalancerType: 'application',
  subnets: [publicSubnet1.id, publicSubnet2.id],
  securityGroups: [webSecurityGroup.id],
  tags: {
    Name: `user-doc-chat-alb-${environment}`,
    Environment: environment,
  },
});

// Export all outputs
export const vpcId = vpc.id;
export const publicSubnet1Id = publicSubnet1.id;
export const publicSubnet2Id = publicSubnet2.id;
export const privateSubnet1Id = privateSubnet1.id;
export const privateSubnet2Id = privateSubnet2.id;
export const internetGatewayId = internetGateway.id;
export const clusterName = cluster.name;
export const clusterEndpoint = cluster.endpoint;
export const nodeGroupName = nodeGroup.nodeGroupName;
export const databaseEndpoint = database.endpoint;
export const databasePassword = dbPassword.result;
export const redisEndpoint = redis.configurationEndpointAddress;
export const redisPassword = redisPasswordResource.result;
export const bucketName = bucket.bucket;
export const bucketArn = bucket.arn;
export const albDnsName = alb.dnsName;
export const albZoneId = alb.zoneId;
export const certificateArn = certificate.arn;
export const webSecurityGroupId = webSecurityGroup.id;
export const dbSecurityGroupId = dbSecurityGroup.id;
export const redisSecurityGroupId = redisSecurityGroup.id;
