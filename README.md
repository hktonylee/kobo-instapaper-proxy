# Kobo Instapaper Proxy

Read web articles on a Kobo device or save them to Instapaper without unnecessary clutter. Point the proxy at any article link and it returns a clean, lightweight HTML page that feels native on e-ink readers.

## What it does

- Retrieves the article and removes pop-ups, banners, and sidebars so only the text remains.
- Leaves images and media hosted on the source site so pages stay compact and fast.
- Rewrites links so article chains continue to work within the proxy.

## How to use it

1. Deploy the proxy to your AWS account using the provided setup.
2. Copy the "invoke URL" produced after deployment.
3. Combine that URL with any article link, for example:
   ```
   https://<your-invoke-url>/https://www.example.com/news
   ```
4. Open the combined link on your Kobo or send it to Instapaper to receive a reader-friendly version of the article.

For implementation details or configuration options, see [TECHNICAL.md](TECHNICAL.md).
