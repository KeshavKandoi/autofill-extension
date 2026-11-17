# Autofill release package

- `autofill-ai-extension.zip` is the Chrome Web Store upload. It contains the production build with `manifest.json` at the root.
- `assets/` contains two 1280×800 screenshots captured from the extension and a 440×280 promotional tile. Use `../public/icons/128.png` for the 128×128 store icon if requested separately.
- `LISTING.md` contains listing text, reviewer instructions and draft privacy declarations.
- `privacy.html` is a standalone policy page. Host it at a public HTTPS URL and enter that URL in the dashboard before submitting.

## Publish when ready

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Choose **Add new item** and upload the ZIP. Add the listing text, screenshots, icon and promotional tile.
3. Enter your public privacy-policy URL and support contact. Review and certify the dashboard disclosures against the build.
4. Choose **Unlisted** for a shareable link or **Public** for store discovery. Submit for review. Once approved and published, the store listing supplies the **Add to Chrome** button.

## Try the same package locally

Extract the ZIP, open `chrome://extensions`, turn on **Developer mode**, then choose **Load unpacked** and select the folder containing `manifest.json`.

## Rebuild

From the project root, build and run the asset generator with the installed Playwright Chromium. The ZIP command writes a fresh package through a temporary archive.

```sh
npm run build
npx playwright install chromium
node scripts/store-assets.mjs
(cd dist && zip -q -r ../release/autofill-ai-next.zip .)
mv release/autofill-ai-next.zip release/autofill-ai-extension.zip
```
