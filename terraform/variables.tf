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

variable "cookie_jar_bucket" {
  description = "S3 bucket that stores a JSON cookie jar to preload into the browser session."
  type        = string
  default     = ""
}

variable "cookie_jar_key" {
  description = "S3 object key for the JSON cookie jar."
  type        = string
  default     = ""
}
