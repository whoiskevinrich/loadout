import * as path from 'path'
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export interface LoadoutStackProps extends StackProps {
  domainName: string
  zoneName: string
  certificateArn: string
  webDistPath: string
}

export class LoadoutStack extends Stack {
  constructor(scope: Construct, id: string, props: LoadoutStackProps) {
    super(scope, id, props)

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'SiteCert',
      props.certificateArn,
    )

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      domainNames: [props.domainName],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // PRICE_CLASS_100 = US + Europe edges only; cheapest option that still feels fast.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
    })

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.zoneName,
    })

    new route53.ARecord(this, 'AliasRecord', {
      zone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.resolve(__dirname, props.webDistPath))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    })

    new CfnOutput(this, 'SiteUrl', { value: `https://${props.domainName}` })
    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName })
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName })
  }
}
