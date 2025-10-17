import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as random from '@pulumi/random';

// Get configuration
const config = new pulumi.Config();
const environment = config.get('environment') || 'prod';
const domain = config.get('domain') || 'user-doc-chat.com';
const region = config.get('aws:region') || 'us-west-2';

// Create VPC and networking
const vpc = new aws.ec2.Vpc(`user-doc-chat-vpc-${environment}`, {
  cidrBlock: '10.0.0.0/16',
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `user-doc-chat-vpc-${environment}`,
    Environment: environment,
  },
});

const publicSubnet1 = new aws.ec2.Subnet(
  `user-doc-chat-public-1-${environment}`,
  {
    vpcId: vpc.id,
    cidrBlock: '10.0.1.0/24',
    availabilityZone: `${region}a`,
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
    cidrBlock: '10.0.2.0/24',
    availabilityZone: `${region}b`,
    mapPublicIpOnLaunch: true,
    tags: {
      Name: `user-doc-chat-public-2-${environment}`,
      Environment: environment,
    },
  },
);

const privateSubnet1 = new aws.ec2.Subnet(
  `user-doc-chat-private-1-${environment}`,
  {
    vpcId: vpc.id,
    cidrBlock: '10.0.3.0/24',
    availabilityZone: `${region}a`,
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
    cidrBlock: '10.0.4.0/24',
    availabilityZone: `${region}b`,
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

// Route Table for public subnets
const publicRouteTable = new aws.ec2.RouteTable(
  `user-doc-chat-public-rt-${environment}`,
  {
    vpcId: vpc.id,
    tags: {
      Name: `user-doc-chat-public-rt-${environment}`,
      Environment: environment,
    },
  },
);

const publicRoute = new aws.ec2.Route(
  `user-doc-chat-public-route-${environment}`,
  {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: '0.0.0.0/0',
    gatewayId: internetGateway.id,
  },
);

// Associate public subnets with route table
const publicSubnet1Association = new aws.ec2.RouteTableAssociation(
  `user-doc-chat-public-1-assoc-${environment}`,
  {
    subnetId: publicSubnet1.id,
    routeTableId: publicRouteTable.id,
  },
);

const publicSubnet2Association = new aws.ec2.RouteTableAssociation(
  `user-doc-chat-public-2-assoc-${environment}`,
  {
    subnetId: publicSubnet2.id,
    routeTableId: publicRouteTable.id,
  },
);

// EKS Cluster
const clusterRole = new aws.iam.Role(
  `user-doc-chat-eks-cluster-role-${environment}`,
  {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'eks.amazonaws.com',
          },
        },
      ],
    }),
  },
);

new aws.iam.RolePolicyAttachment(
  `user-doc-chat-eks-cluster-policy-${environment}`,
  {
    role: clusterRole.name,
    policyArn: 'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy',
  },
);

const nodeGroupRole = new aws.iam.Role(
  `user-doc-chat-eks-node-role-${environment}`,
  {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'ec2.amazonaws.com',
          },
        },
      ],
    }),
  },
);

new aws.iam.RolePolicyAttachment(
  `user-doc-chat-eks-node-policy-${environment}`,
  {
    role: nodeGroupRole.name,
    policyArn: 'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
  },
);

new aws.iam.RolePolicyAttachment(
  `user-doc-chat-eks-node-cni-policy-${environment}`,
  {
    role: nodeGroupRole.name,
    policyArn: 'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy',
  },
);

new aws.iam.RolePolicyAttachment(
  `user-doc-chat-eks-node-registry-policy-${environment}`,
  {
    role: nodeGroupRole.name,
    policyArn: 'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly',
  },
);

// EKS Cluster
const cluster = new aws.eks.Cluster(`user-doc-chat-eks-${environment}`, {
  roleArn: clusterRole.arn,
  vpcConfig: {
    subnetIds: [
      publicSubnet1.id,
      publicSubnet2.id,
      privateSubnet1.id,
      privateSubnet2.id,
    ],
    endpointPrivateAccess: true,
    endpointPublicAccess: true,
    publicAccessCidrs: ['0.0.0.0/0'],
  },
  version: '1.28',
  tags: {
    Name: `user-doc-chat-eks-${environment}`,
    Environment: environment,
  },
});

// Node Group
const nodeGroup = new aws.eks.NodeGroup(
  `user-doc-chat-node-group-${environment}`,
  {
    clusterName: cluster.name,
    nodeRoleArn: nodeGroupRole.arn,
    subnetIds: [privateSubnet1.id, privateSubnet2.id],
    instanceTypes: ['t3.medium'],
    scalingConfig: {
      desiredSize: 2,
      maxSize: 10,
      minSize: 1,
    },
    updateConfig: {
      maxUnavailable: 1,
    },
    tags: {
      Name: `user-doc-chat-node-group-${environment}`,
      Environment: environment,
    },
  },
);

// RDS Database
const dbSubnetGroup = new aws.rds.SubnetGroup(
  `user-doc-chat-db-subnet-group-${environment}`,
  {
    subnetIds: [privateSubnet1.id, privateSubnet2.id],
    tags: {
      Name: `user-doc-chat-db-subnet-group-${environment}`,
      Environment: environment,
    },
  },
);

const dbPassword = new random.RandomPassword(
  `user-doc-chat-db-password-${environment}`,
  {
    length: 32,
    special: true,
  },
);

const db = new aws.rds.Instance(`user-doc-chat-db-${environment}`, {
  identifier: `user-doc-chat-db-${environment}`,
  engine: 'postgres',
  engineVersion: '16.1',
  instanceClass: 'db.t3.micro',
  allocatedStorage: 20,
  maxAllocatedStorage: 100,
  storageType: 'gp2',
  storageEncrypted: true,
  dbName: 'user_doc_chat_prod',
  username: 'postgres',
  password: dbPassword.result,
  vpcSecurityGroupIds: [], // Will be added later
  dbSubnetGroupName: dbSubnetGroup.name,
  backupRetentionPeriod: 7,
  backupWindow: '03:00-04:00',
  maintenanceWindow: 'sun:04:00-sun:05:00',
  skipFinalSnapshot: environment !== 'prod',
  deletionProtection: environment === 'prod',
  tags: {
    Name: `user-doc-chat-db-${environment}`,
    Environment: environment,
  },
});

// ElastiCache Redis
const redisSubnetGroup = new aws.elasticache.SubnetGroup(
  `user-doc-chat-redis-subnet-group-${environment}`,
  {
    subnetIds: [privateSubnet1.id, privateSubnet2.id],
  },
);

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
    description: `Redis cluster for user-doc-chat ${environment}`,
    nodeType: 'cache.t3.micro',
    port: 6379,
    parameterGroupName: 'default.redis7',
    numCacheClusters: 2,
    automaticFailoverEnabled: true,
    multiAzEnabled: true,
    subnetGroupName: redisSubnetGroup.name,
    authToken: redisPasswordResource.result,
    atRestEncryptionEnabled: true,
    transitEncryptionEnabled: true,
    tags: {
      Name: `user-doc-chat-redis-${environment}`,
      Environment: environment,
    },
  },
);

// S3 Bucket for file storage
const bucket = new aws.s3.Bucket(`user-doc-chat-storage-${environment}`, {
  bucket: `user-doc-chat-storage-${environment}-${pulumi.getStack()}`,
  versioning: {
    enabled: true,
  },
  serverSideEncryptionConfiguration: {
    rule: {
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: 'AES256',
      },
    },
  },
  tags: {
    Name: `user-doc-chat-storage-${environment}`,
    Environment: environment,
  },
});

// Security Groups
const dbSecurityGroup = new aws.ec2.SecurityGroup(
  `user-doc-chat-db-sg-${environment}`,
  {
    vpcId: vpc.id,
    description: 'Security group for RDS database',
    ingress: [
      {
        fromPort: 5432,
        toPort: 5432,
        protocol: 'tcp',
        cidrBlocks: [vpc.cidrBlock],
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
      Name: `user-doc-chat-db-sg-${environment}`,
      Environment: environment,
    },
  },
);

const redisSecurityGroup = new aws.ec2.SecurityGroup(
  `user-doc-chat-redis-sg-${environment}`,
  {
    vpcId: vpc.id,
    description: 'Security group for ElastiCache Redis',
    ingress: [
      {
        fromPort: 6379,
        toPort: 6379,
        protocol: 'tcp',
        cidrBlocks: [vpc.cidrBlock],
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
      Name: `user-doc-chat-redis-sg-${environment}`,
      Environment: environment,
    },
  },
);

// Update RDS and Redis with security groups
const dbWithSg = new aws.rds.Instance(
  `user-doc-chat-db-with-sg-${environment}`,
  {
    identifier: `user-doc-chat-db-${environment}`,
    engine: 'postgres',
    engineVersion: '16.1',
    instanceClass: 'db.t3.micro',
    allocatedStorage: 20,
    maxAllocatedStorage: 100,
    storageType: 'gp2',
    storageEncrypted: true,
    dbName: 'user_doc_chat_prod',
    username: 'postgres',
    password: dbPassword.result,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    dbSubnetGroupName: dbSubnetGroup.name,
    backupRetentionPeriod: 7,
    backupWindow: '03:00-04:00',
    maintenanceWindow: 'sun:04:00-sun:05:00',
    skipFinalSnapshot: environment !== 'prod',
    deletionProtection: environment === 'prod',
    tags: {
      Name: `user-doc-chat-db-${environment}`,
      Environment: environment,
    },
  },
  { dependsOn: [db] },
);

const redisWithSg = new aws.elasticache.ReplicationGroup(
  `user-doc-chat-redis-with-sg-${environment}`,
  {
    replicationGroupId: `user-doc-chat-redis-${environment}`,
    description: `Redis cluster for user-doc-chat ${environment}`,
    nodeType: 'cache.t3.micro',
    port: 6379,
    parameterGroupName: 'default.redis7',
    numCacheClusters: 2,
    automaticFailoverEnabled: true,
    multiAzEnabled: true,
    subnetGroupName: redisSubnetGroup.name,
    authToken: redisPasswordResource.result,
    atRestEncryptionEnabled: true,
    transitEncryptionEnabled: true,
    securityGroupIds: [redisSecurityGroup.id],
    tags: {
      Name: `user-doc-chat-redis-${environment}`,
      Environment: environment,
    },
  },
  { dependsOn: [redis] },
);

// Application Load Balancer
const alb = new aws.lb.LoadBalancer(`user-doc-chat-alb-${environment}`, {
  name: `user-doc-chat-alb-${environment}`,
  loadBalancerType: 'application',
  subnets: [publicSubnet1.id, publicSubnet2.id],
  securityGroups: [],
  tags: {
    Name: `user-doc-chat-alb-${environment}`,
    Environment: environment,
  },
});

// SSL Certificate
const certificate = new aws.acm.Certificate(
  `user-doc-chat-cert-${environment}`,
  {
    domainName: domain,
    subjectAlternativeNames: [`*.${domain}`],
    validationMethod: 'DNS',
    tags: {
      Name: `user-doc-chat-cert-${environment}`,
      Environment: environment,
    },
  },
);

// Route 53 Hosted Zone
const hostedZone = new aws.route53.Zone(`user-doc-chat-zone-${environment}`, {
  name: domain,
  tags: {
    Name: `user-doc-chat-zone-${environment}`,
    Environment: environment,
  },
});

// Certificate validation
const certificateValidation = new aws.acm.CertificateValidation(
  `user-doc-chat-cert-validation-${environment}`,
  {
    certificateArn: certificate.arn,
    validationRecordFqdns: [], // Will be populated by DNS validation
  },
);

// Export important values
export const vpcId = vpc.id;
export const clusterName = cluster.name;
export const clusterEndpoint = cluster.endpoint;
export const clusterKubeconfig = pulumi
  .all([cluster.name, cluster.endpoint, cluster.certificateAuthority])
  .apply(([name, endpoint, ca]) => {
    return {
      apiVersion: 'v1',
      clusters: [
        {
          cluster: {
            server: endpoint,
            'certificate-authority-data': ca.data,
          },
          name: 'kubernetes',
        },
      ],
      contexts: [
        {
          context: {
            cluster: 'kubernetes',
            user: 'aws',
          },
          name: 'aws',
        },
      ],
      'current-context': 'aws',
      kind: 'Config',
      users: [
        {
          name: 'aws',
          user: {
            exec: {
              apiVersion: 'client.authentication.k8s.io/v1beta1',
              command: 'aws',
              args: ['eks', 'get-token', '--cluster-name', name],
            },
          },
        },
      ],
    };
  });

export const databaseEndpoint = dbWithSg.endpoint;
export const databasePassword = dbPassword.result;
export const redisEndpoint = redisWithSg.configurationEndpointAddress;
export const redisPassword = redisPasswordResource.result;
export const bucketName = bucket.id;
export const bucketArn = bucket.arn;
export const albDnsName = alb.dnsName;
export const albZoneId = alb.zoneId;
export const certificateArn = certificate.arn;
export const hostedZoneId = hostedZone.id;
