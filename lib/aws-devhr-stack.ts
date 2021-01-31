import * as cdk from '@aws-cdk/core';
import s3 = require('@aws-cdk/aws-s3');
import lambda = require('@aws-cdk/aws-lambda');
import dynamodb = require('@aws-cdk/aws-dynamodb');
import iam = require('@aws-cdk/aws-iam');
import event_sources = require('@aws-cdk/aws-lambda-event-sources');
import { Duration } from '@aws-cdk/core';

const imageBucketName = 'cdk-rekn-imagebucket'

export class AwsDevhrStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Image Bucket
    const imageBucket = new s3.Bucket(this, imageBucketName)
    new cdk.CfnOutput(this, 'imageBucket', { value: imageBucket.bucketName });
  }
}
