import * as cdk from '@aws-cdk/core';
import s3 = require('@aws-cdk/aws-s3');
import lambda = require('@aws-cdk/aws-lambda');
import dynamodb = require('@aws-cdk/aws-dynamodb');
import iam = require('@aws-cdk/aws-iam');
import event_sources = require('@aws-cdk/aws-lambda-event-sources');
import apigw = require('@aws-cdk/aws-apigateway');
import { Duration } from '@aws-cdk/core';
import { PassthroughBehavior } from '@aws-cdk/aws-apigateway';
import { triggerAsyncId } from 'async_hooks';

const imageBucketName = 'cdk-rekn-imagebucket'
const resizedBucketName = imageBucketName + "-resized"

export class AwsDevhrStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 Image Bucket
    const imageBucket = new s3.Bucket(this, imageBucketName, {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    new cdk.CfnOutput(this, 'imageBucket', { value: imageBucket.bucketName });

    // Create S3 Thumbnail Bucket
    const resizedBucket = new s3.Bucket(this, resizedBucketName, {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    new cdk.CfnOutput(this, 'resizedBucket', { value: resizedBucket.bucketName });

    // Create DynamoDB table for storing image labels
    const table = new dynamodb.Table(this, 'ImageLabels', {
      partitionKey: { name: 'image', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    new cdk.CfnOutput(this, 'ddbTable', { value: table.tableName });

    // Create Lambda function for reklayer
    const layer = new lambda.LayerVersion(this, 'pil', {
      code: lambda.Code.fromAsset('reklayer'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_7],
      license: 'Apache-2.0',
      description: 'A layer to enable the PIL library in our Rekognition Lambda'
    });

    // Create Lambda function for rekognition
    const rekFn = new lambda.Function(this, 'rekognitionFunction', {
      code: lambda.Code.fromAsset('rekognitionlambda'),
      runtime: lambda.Runtime.PYTHON_3_7,
      handler: 'index.handler',
      timeout: Duration.seconds(30),
      memorySize: 1024,
      layers: [layer],
      environment: {
        "TABLE": table.tableName,
        "BUCKET": imageBucket.bucketName,
        "RESIZEDBUCKET": resizedBucket.bucketName
      },
    });

    rekFn.addEventSource(new event_sources.S3EventSource(imageBucket, { events: [ s3.EventType.OBJECT_CREATED ] }));
    imageBucket.grantRead(rekFn);
    resizedBucket.grantPut(rekFn);
    table.grantWriteData(rekFn);

    rekFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['rekognition:DetectLabels'],
      resources: ['*']
    }));

    // Lambda for Synchronous Frontend
    const serviceFn = new lambda.Function(this, 'serviceFunction', {
      code: lambda.Code.fromAsset('servicelambda'),
      runtime: lambda.Runtime.PYTHON_3_7,
      handler: 'index.handler',
      environment: {
        "TABLE": table.tableName,
        "BUCKET": imageBucket.bucketName,
        "RESIZEDBUCKET": resizedBucket.bucketName
      },
    });

    imageBucket.grantWrite(serviceFn);
    resizedBucket.grantWrite(serviceFn);
    table.grantReadWriteData(serviceFn);

    const api = new apigw.LambdaRestApi(this, 'imageAPI', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS
      },
      handler: serviceFn,
      proxy: false,
    });

    // Create Amazon API Gateway with AWS Lambda Integration
    const lambdaIntegration = new apigw.LambdaIntegration(serviceFn, {
      proxy: false,
      requestParameters: {
        'integration.request.querystring.action': 'method.request.querystring.action',
        'integration.request.querystring.key': 'method.request.querystring.key'
      },
      requestTemplates: {
        'application/json': JSON.stringify({ 
          action: "$util.escapeJavaScript($input.params('action'))",
          key: "$util.escapeJavascript($input.params('key'))"
        })
      },
      passthroughBehavior: PassthroughBehavior.WHEN_NO_TEMPLATES,
      integrationResponses: [
        {
          statusCode: "200",
          // Map response parameters
          // - Destination parameters (the key) are the response parameters (used in mappings)
          // - Source parameters (the value) are the integration response parameters or expressions
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'"
          }
        },
        {
          // For errors, if error message is not empty, get the error data
          selectionPattern: "(\n|.)+",
          statusCode: "500",
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'"
          }
        }
      ]
    });

    // API Gateway
    const imageAPI = api.root.addResource('images');

    // GET /images
    imageAPI.addMethod('GET', lambdaIntegration, {
      requestParameters: {
        'method.request.querystring.action': true,
        'method.request.querystring.key': true
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        },
        {
          statusCode: "500",
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        }
      ]
    });

    // DELETE /images
    imageAPI.addMethod('DELETE', lambdaIntegration, {
      requestParameters: {
        'method.request.querystring.action': true,
        'method.request.querystring.key': true
      },
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        },
        {
          statusCode: "500",
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        }
      ]
    });

  }
}
