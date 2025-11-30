variable "aws_region" {
  description = "AWS region for API Gateway and Lambda"
  type        = string
  default     = "us-west-2"
}

variable "chromium_layer_arn" {
  description = "ARN of a Lambda layer that provides headless Chromium (e.g., @sparticuz/chromium)."
  type        = string
  default     = ""
}
