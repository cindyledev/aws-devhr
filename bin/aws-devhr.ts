#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsDevhrStack } from '../lib/aws-devhr-stack';

const app = new cdk.App();
new AwsDevhrStack(app, 'AwsDevhrStack');
