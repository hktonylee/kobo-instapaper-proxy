# Kobo Instapaper Proxy

Read web articles on a Kobo or save them to Instapaper without the clutter. Point the proxy at any article link and it delivers a clean, light HTML page that feels native on e-ink readers.

## What it does (in plain English)

- Fetches the article for you and strips away pop-ups, banners, and sidebars so you can focus on the words.
- Keeps images and media loading directly from the original site so pages stay small and quick.
- Rewrites links so you can keep tapping through an article series without leaving the proxy.

## How to use it

1. Deploy the proxy to your own AWS account (there is a ready-made setup included).
2. Copy the "invoke URL" the setup prints when it finishes.
3. When you want to read something, take any article link and stick it after that URL, for example:
   ```
   https://<your-invoke-url>/https://www.example.com/news
   ```
4. Load that combined link on your Kobo or send it to Instapaper. You'll get a reader-friendly version of the article.

If you just want to read, that's all you need to know. If you're curious about how the proxy is built or want to tweak it, check out the technical guide below.

## Want the technical details?

Everything about how it works under the hood—build steps, AWS resources, and configuration options—is in [TECHNICAL.md](TECHNICAL.md).
