import { describe, it, expect, beforeAll } from 'vitest';
import * as pulumi from '@pulumi/pulumi';

// Mock Pulumi
pulumi.runtime.setMocks({
  newResource: (
    args: pulumi.runtime.MockResourceArgs,
  ): { id: string; state: any } => {
    return {
      id: `${args.type}-${args.name}`,
      state: args.inputs,
    };
  },
  call: (args: pulumi.runtime.MockCallArgs): any => {
    return args.inputs;
  },
});

describe('Simple Infrastructure', () => {
  let infrastructure: any;

  beforeAll(async () => {
    // Import the infrastructure
    infrastructure = await import('../simple-infrastructure');
  });

  it('should create VPC', () => {
    expect(infrastructure.vpcId).toBeDefined();
  });

  it('should create public subnets', () => {
    expect(infrastructure.publicSubnet1Id).toBeDefined();
    expect(infrastructure.publicSubnet2Id).toBeDefined();
  });

  it('should create S3 bucket', () => {
    expect(infrastructure.bucketName).toBeDefined();
    expect(infrastructure.bucketArn).toBeDefined();
  });
});
