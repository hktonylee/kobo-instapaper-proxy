terraform {
  required_version = ">= 1.2"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.8"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

locals {
  lambda_package = "${path.module}/../lambda/build/lambda.zip"
  chromium_layer = var.chromium_layer_arn != "" ? var.chromium_layer_arn : data.aws_lambda_layer_version.chromium.arn
  has_cookie_jar = var.cookie_jar_bucket != "" && var.cookie_jar_key != ""
}

data "aws_lambda_layer_version" "chromium" {
  layer_name = "arn:aws:lambda:${var.aws_region}:764866452798:layer:chrome-aws-lambda"
  version    = 50
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/dist"
  output_path = local.lambda_package
}

resource "aws_cloudwatch_log_group" "proxy_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.proxy.function_name}"
  retention_in_days = 14
}

resource "aws_iam_role" "lambda_exec" {
  name = "kobo-instapaper-proxy-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "cookie_jar_read" {
  count = local.has_cookie_jar ? 1 : 0

  name = "kobo-instapaper-proxy-cookie-jar"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${var.cookie_jar_bucket}/${var.cookie_jar_key}"
      }
    ]
  })
}

resource "aws_lambda_function" "proxy" {
  function_name = "kobo-instapaper-proxy"
  filename      = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  role    = aws_iam_role.lambda_exec.arn
  handler = "src/handler.handler"
  runtime = "nodejs20.x"

  layers = [local.chromium_layer]

  memory_size = 1536
  timeout     = 30

  environment {
    variables = {
      NODE_OPTIONS        = "--enable-source-maps"
      COOKIE_JAR_S3_BUCKET = var.cookie_jar_bucket
      COOKIE_JAR_S3_KEY    = var.cookie_jar_key
    }
  }

  depends_on = concat(
    [aws_iam_role_policy_attachment.lambda_basic],
    aws_iam_role_policy.cookie_jar_read[*]
  )
}

resource "aws_apigatewayv2_api" "proxy" {
  name          = "kobo-instapaper-proxy"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.proxy.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.proxy.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy_route" {
  api_id    = aws_apigatewayv2_api.proxy.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.proxy.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowInvokeFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.proxy.execution_arn}/*/*"
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

output "invoke_url" {
  description = "API Gateway base URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "chromium_layer_arn" {
  description = "ARN of the Chromium Lambda layer in use"
  value       = local.chromium_layer
}

output "lambda_role_arn" {
  description = "IAM role for the Lambda function"
  value       = aws_iam_role.lambda_exec.arn
}

output "deployer_account" {
  description = "AWS account used for deployment"
  value       = data.aws_caller_identity.current.account_id
}
