# Publishing on the Chrome Web Store

Material ready for the store listing and for the review. What requires the developer account (publishing the privacy policy, filling in the dashboard, uploading the zip) remains to be done by hand: the steps are at the bottom.

| File | Contents |
|---|---|
| [listing.md](listing.md) | Name, summary, detailed description and category, in Italian and in English |
| [privacy.md](privacy.md) | Public privacy policy, in English and in Italian |
| [privacy-practices.md](privacy-practices.md) | Single purpose, justification of each permission, remote code, data usage and certifications |
| `it/`, `en/` | 4 screenshots 1280×800 and the 440×280 promotional tile per language |
| `icon-128.png` | Store icon: 96×96 artwork with 16 px of transparent padding |

## Regenerating the images

`npm run store-assets` (macOS or Linux, requires `openssl`). It uses the test build, tabs with realistic titles served locally and a fake Generator, so the images come out the same on every run. Image texts are in `COPY` in `scripts/store-assets.mjs`.

## The zip

`npm run zip` creates `.output/autogroup-<version>-chrome.zip` from the normal build (optional host permissions only). Before each new version, increase `version` in `package.json`.

## Manual steps

1. **Publish the privacy policy** from [privacy.md](privacy.md) at a public address: a public GitHub Gist (`gh gist create --public docs/store/privacy.md`), a page in a public repository, GitHub Pages or Google Sites. For questions the policy asks readers to leave a comment on that page; add a contact email if you prefer.
2. **Developer account** at <https://chrome.google.com/webstore/devconsole> (one-time registration).
3. **New item**: upload the zip.
4. **Store listing**: texts from [listing.md](listing.md) for Italian and English, icon, screenshots and tile for the right language.
5. **Privacy practices**: answers from [privacy-practices.md](privacy-practices.md) and the privacy policy URL.
6. **Distribution**: visibility (public, unlisted or private) and countries.
7. Submit for review.
