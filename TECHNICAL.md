# Technical guide

This document collects the build, deployment, and implementation details for the Kobo Instapaper Proxy.

## Components

- **Lambda** (`lambda/src/handler.js`): Navigates to a requested URL, renders it with `puppeteer-core` + `@sparticuz/chromium`, parses the readable article, rewrites navigation links to proxy through API Gateway, and returns a minimal HTML payload.
- **API Gateway (HTTP API)**: Receives any path (e.g., `/https://www.example.com/news`) and forwards the request to the Lambda. The Lambda uses the path to determine which URL to fetch and render.
- **Terraform**: Creates the Lambda, its IAM role, CloudWatch log group, HTTP API, default `$default` route, and the required invocation permission. Uses an S3 backend for state.

## Build the Lambda bundle

1. Install dependencies and produce a single minified `lambda/dist/src/handler.js` bundle without shipping `node_modules`. The build disables Chromium downloads because the binary is supplied by a Lambda layer and bundles all other dependencies into the handler:
   ```bash
   cd lambda
   npm run build
   cd ..
   ```

## Configure Terraform backend

Create a backend configuration (kept out of version control) to point Terraform at your S3 state bucket:

```hcl
# terraform/backend.hcl (do not commit)
bucket  = "<your-state-bucket>"
key     = "<your-state-key>"
region  = "<your-region>"
encrypt = true
```

## Deploy with Terraform

By default, the Terraform module will attach the pinned `@sparticuz/chromium` layer release `arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:50` (resolved for your chosen region). If you want to override it with a specific layer ARN, pass `-var "chromium_layer_arn=<your-layer-arn>"`.

```bash
cd terraform
terraform init -backend-config=backend.hcl
terraform apply
```

To preload authenticated sessions, store a cookie jar in S3 and supply its location via variables:

```bash
terraform apply \
  -var "cookie_jar_bucket=<bucket>" \
  -var "cookie_jar_key=<path/to/cookies>"
```

The cookie jar can be either a Puppeteer/Chrome-style JSON array **or** a Netscape HTTP cookie file (multiple sites in one file
are supported). Lines beginning with `#HttpOnly_` are parsed so HttpOnly cookies are preserved.

Ensure the backend bucket/key exist, your AWS credentials are configured, and that your AWS account can access the public `@sparticuz/chromium` layer (account `764866452798`). If you need to pin a specific version or use a custom layer, provide its ARN via `chromium_layer_arn`. See [@sparticuz/chromium releases](https://github.com/Sparticuz/chromium#aws-lambda-layer) for the latest ARNs.

After apply, Terraform outputs `invoke_url`. Append an encoded URL path to use the proxy, such as:

```
https://<invoke_url>/https://www.example.com/news
```

## Implementation notes

- The Lambda uses headless Chromium from a Lambda layer (`@sparticuz/chromium`) with `puppeteer-core`. The build command skips downloading Chromium to keep the deployment package small; the executable is provided by the layer.
- Links in the extracted article are rewritten to call back through the API Gateway host so that navigation stays within the proxy, while media assets load directly from their original hosts.
- The HTML response is intentionally minimal to work well on Kobo devices and for saving to Instapaper.
