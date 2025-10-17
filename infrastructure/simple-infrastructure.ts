import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

// Get configuration
const config = new pulumi.Config();
const environment = config.get('environment') || 'prod';

// VPC
const vpc = new aws.ec2.Vpc(`user-doc-chat-vpc-${environment}`, {
  cidrBlock: '10.0.0.0/16',
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
    cidrBlock: '10.0.1.0/24',
    availabilityZone: 'us-west-2a',
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
    availabilityZone: 'us-west-2b',
    mapPublicIpOnLaunch: true,
    tags: {
      Name: `user-doc-chat-public-2-${environment}`,
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

// Route Table
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

// Route
new aws.ec2.Route(`user-doc-chat-public-route-${environment}`, {
  routeTableId: publicRouteTable.id,
  destinationCidrBlock: '0.0.0.0/0',
  gatewayId: internetGateway.id,
});

// Route Table Associations
new aws.ec2.RouteTableAssociation(`user-doc-chat-public-1-rta-${environment}`, {
  subnetId: publicSubnet1.id,
  routeTableId: publicRouteTable.id,
});

new aws.ec2.RouteTableAssociation(`user-doc-chat-public-2-rta-${environment}`, {
  subnetId: publicSubnet2.id,
  routeTableId: publicRouteTable.id,
});

// S3 Bucket
const bucket = new aws.s3.Bucket(`user-doc-chat-bucket-${environment}`, {
  tags: {
    Name: `user-doc-chat-bucket-${environment}`,
    Environment: environment,
  },
});

// Export outputs
export const vpcId = vpc.id;
export const publicSubnet1Id = publicSubnet1.id;
export const publicSubnet2Id = publicSubnet2.id;
export const bucketName = bucket.id;
export const bucketArn = bucket.arn;
