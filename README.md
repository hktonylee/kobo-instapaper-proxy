# Kobo Instapaper Proxy

Read web articles on a Kobo device or save them to Instapaper without unnecessary clutter. Point the proxy at any article link and it returns a clean, lightweight HTML page that feels native on e-ink readers.

## What it does

- Retrieves the article and removes pop-ups, banners, and sidebars so only the text remains.
- Converts embedded images to JPEG via a `/jpg/` subpath so Kobo devices can display them reliably.
- Rewrites links so article chains continue to work within the proxy.

## How to use it

1. Deploy the proxy to your AWS account using the provided setup.
2. Copy the "invoke URL" produced after deployment.
3. Combine that URL with any article link, for example:
   ```
   https://<your-invoke-url>/https://www.example.com/news
   ```
4. To load an image through the proxy as a JPEG, prepend `/jpg/` before the target URL:
   ```
   https://<your-invoke-url>/jpg/https://www.example.com/path/to/image.png
   ```
5. Open the combined link on your Kobo or send it to Instapaper to receive a reader-friendly version of the article.

## Test locally with a CLI

You can render pages locally without deploying to AWS Lambda by using the built-in CLI:

```bash
cd lambda
npm install
npm run cli -- https://www.example.com/news --output article.html
```

Flags:
- `--output <file>`: Save the rendered HTML instead of printing to stdout.
- `--host <value>` / `--proto <http|https>` / `--prefix <basePath>`: Override the proxy base used when rewriting links.

For implementation details or configuration options, see [TECHNICAL.md](TECHNICAL.md).

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
