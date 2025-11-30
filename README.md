# Kobo Instapaper Proxy

This project packages an AWS Lambda behind an Amazon API Gateway endpoint. It proxies article URLs, renders them with headless Chromium (via the `@sparticuz/chromium` Lambda layer and `puppeteer-core`), extracts the main article with Mozilla Readability, rewrites links and media URLs to route back through the proxy, and returns a lightweight HTML page suitable for Kobo or Instapaper reading.

## Components

- **Lambda** (`lambda/src/handler.js`): Navigates to a requested URL, renders it with `puppeteer-core` + `@sparticuz/chromium`, parses the readable article, rewrites links to proxy through API Gateway, and returns a minimal HTML payload.
- **API Gateway (HTTP API)**: Receives any path (e.g., `/https://www.example.com/news`) and forwards the request to the Lambda. The Lambda uses the path to determine which URL to fetch and render.
- **Terraform**: Creates the Lambda, its IAM role, CloudWatch log group, HTTP API, default `$default` route, and the required invocation permission. Uses an S3 backend for state.

## Getting started

1. **Build the Lambda artifact** (produces a minified `lambda/dist` bundle with production dependencies). The build disables Chromium downloads because the binary is supplied by a Lambda layer:
   ```bash
   cd lambda
   npm run build
   cd ..
   ```

2. **Provide backend configuration** (kept out of version control):
   ```hcl
   # terraform/backend.hcl (do not commit)
   bucket  = "<your-state-bucket>"
   key     = "<your-state-key>"
   region  = "<your-region>"
   encrypt = true
   ```

3. **Initialize and deploy with Terraform**, providing the ARN of a Chromium Lambda layer (for example, the published `@sparticuz/chromium` layer for your region):
   ```bash
   cd terraform
   terraform init -backend-config=backend.hcl
   terraform apply -var "chromium_layer_arn=arn:aws:lambda:<region>:764866452798:layer:chromium:126"
   ```

   Ensure the backend bucket/key exist, your AWS credentials are configured, and the layer ARN matches your region/version. See [@sparticuz/chromium releases](https://github.com/Sparticuz/chromium#aws-lambda-layer) for the latest ARNs.

4. **Invoke**: After apply, Terraform outputs `invoke_url`. Append an encoded URL path to use the proxy, such as:
   ```
   https://<invoke_url>/https://www.example.com/news
   ```

## Notes

- The Lambda uses headless Chromium from a Lambda layer (`@sparticuz/chromium`) with `puppeteer-core`. The build command skips downloading Chromium to keep the deployment package small; the executable is provided by the layer.
- Links and media sources in the extracted article are rewritten to call back through the API Gateway host so that images and nested pages continue to load through the proxy.
- The HTML response is intentionally minimal to work well on Kobo devices and for saving to Instapaper.
