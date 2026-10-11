# YGO Scanner

[![CI](https://github.com/tonyctalope/ygo-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/tonyctalope/ygo-scanner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Scan the set code of your Yu-Gi-Oh! cards with your phone camera, pick the exact print, and export
the batch as a CSV ready to import into **[CardCluster](https://cardcluster.com)** or
**[Dragon Shield Card Manager](https://yugioh.dragonshield.com)**.

The OCR runs on your own computer (PaddleOCR model through ONNX Runtime). No account and no cloud service are needed.

```
Phone ──HTTPS (LAN)──▶ scanner server (your computer) ──public API──▶ cardcluster.com
                          │  OCR: PP-OCRv4 (ONNX) + ImageMagick, tesseract for photos
                          │  scanned cards: DATA_DIR/store.json
                          ▼
              CardCluster CSV  ·  Dragon Shield CSV
```

## Features

- **Live auto-scan.** Aim at the set code (`RA01-EN001`, `LDK2-ENJ41`, `LOB-001`…). The card opens as soon as two frames in a row agree on the code.
- **Exact print picker.** You see every print sharing that code: rarities, alternate artworks, and WCS emblems or stamps, with card images from CardCluster.
- **Language, edition (1st / Unlimited / Limited) and quantity** for each card. The language is guessed from the region code (`-EN`, `-FR`, `-DE`…).
- **Two CSV exports:**
  - CardCluster: *Collection → menu → Import CSV*, in "Add" mode.
  - Dragon Shield: same layout as the app's own export.
- **Manual flow when the CSV is not enough.** CardCluster's import can't tell some prints apart, such as with and without an emblem. Those cards are flagged so you can add them by hand, with a direct link.
- Manual code entry, plus a "Photo" mode for a whole-card picture.
- English and French UI. The phone UI can be installed to the home screen.

## Quick start

### With Docker (recommended)

```sh
git clone https://github.com/tonyctalope/ygo-scanner.git
cd ygo-scanner
echo "CERT_HOSTS=192.168.1.20" > .env   # your computer's LAN IP
docker compose up -d
```

Open `https://192.168.1.20:8443` on your phone, accept the self-signed certificate once, and allow the camera.
CSV files are also available on the computer at <http://127.0.0.1:8787>.

### Without Docker

Requirements:
- Node.js ≥ 22.18. TypeScript runs natively, with no build step for the server.
- ImageMagick (`magick` or `convert`) and `openssl`.
- `tesseract` with English data, only for the "Photo" button.

```sh
# Debian/Ubuntu: sudo apt install imagemagick tesseract-ocr openssl
# macOS:         brew install imagemagick tesseract openssl
ONNXRUNTIME_NODE_INSTALL=skip npm ci   # skips the optional CUDA binaries (~270 MB)
npm run build                          # bundles the web app
npm start
```

The server prints the address to open on the phone, for example `https://192.168.1.20:8443`.
HTTPS is mandatory for camera access, so a self-signed certificate is generated in `data/` on first start.
If a firewall blocks the phone, open the port, for example `sudo ufw allow 8443/tcp`.

## Usage

1. Fill the frame with the set code, found under the artwork on the right. In **Auto** mode the card opens by itself. You can also tap **Scan**, use **Photo**, or type the code.
2. Pick the print, then the language, edition and quantity, and tap **Add to list**.
3. Open **List** and download the CSV you need:
   - **CardCluster:** open your collection → menu → *Import CSV*, mode **Add**.
   - **Dragon Shield:** in Card Manager, use *Import* → *CSV* and pick a folder.
4. Tap **Mark all as imported** to clear the list. Imported cards stay in the history.

Cards flagged *add by hand on CardCluster* are left out of the CardCluster CSV, because the import would pick the wrong version.
Open them with the link, add them on CardCluster, then tap **Done**. They are still included in the Dragon Shield CSV.

## CSV formats

**CardCluster** (`;` separator):

```
Haves;Card name;Set number;Rarity;Artwork number;Set name;Language
3;Lava Golem;RA01-FR001;SR;;25th Anniversary Rarity Collection;fr
```

**Dragon Shield** (`,` separator, with the `sep=,` line its export uses):

```
"sep=,"
Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Rarity,Condition,Printing,Language,Price Bought,Date Bought,AVG,LOW,TREND
,3,0,Lava Golem,RA01,25th Anniversary Rarity Collection,RA01-FR001,SR,NearMint,1st Edition,French,0.00,2026-10-11,,,
```

Rarities are converted to Dragon Shield's abbreviations: `ScR`, `UtR`, `StR`, `QCScR`, `PlScR`, `GR`, `CR`, `GMR`…
Rarities that are not mapped yet keep CardCluster's abbreviation. Additions to `DRAGON_SHIELD_RARITIES` in [`src/exporters.ts`](src/exporters.ts) are welcome.

Identical scans (same print, language and edition) are merged into one row.

## Configuration

Every setting is an environment variable, optionally set in a `.env` file. See [`.env.example`](.env.example).

| Variable | Default | |
| --- | --- | --- |
| `HTTPS_PORT` / `HTTPS_HOST` | `8443` / `0.0.0.0` | Phone-facing HTTPS server |
| `HTTP_PORT` / `HTTP_HOST` | `8787` / `127.0.0.1` | Local HTTP server (CSV downloads) |
| `DATA_DIR` | `./data` | Scanned cards, caches, generated certificate |
| `TLS_CERT` / `TLS_KEY` | — | Use your own certificate |
| `CERT_HOSTS` | — | Extra IPs/names for the self-signed certificate. Delete `data/*.pem` after changing it. |
| `DEBUG_CAPTURE` | `false` | Keep recognised crops in `data/reads/` and camera diagnostics |
| `DEBUG_CAPTURE_KEEP` | `200` | How many crops to keep |
| `OCR_THREADS` | `2` | ONNX Runtime threads |
| `CARDCLUSTER_URL` | `https://cardcluster.com` | |

> **Security note:** the app has no login. Anyone on your local network who can reach port 8443 can add or remove cards from the scan list.
> Run it on a trusted network only, and don't expose it to the internet.

## How the OCR works

- The phone sends two JPEG crops of the guide frame, about 4 per second in auto mode.
- On the server:
  - ImageMagick normalises each crop.
  - The PP-OCRv4 recognition model reads it, with two variants per crop.
  - The text is matched against the list of set codes known to CardCluster.
- A code is kept only when at least two reads agree. The app then waits for two identical frames in a row.
- Ambiguous characters are handled per position. In the card number, `O` is read as `0` and `I` as `1`, but `S` (5 or 8) and `Z` (2 or 7) are rejected rather than guessed.
- Legendary Deck numbers (`J41`) keep their letter. The server tries the digit/letter look-alikes and keeps the one that exists in the set.

## Development

```sh
npm run dev:web    # rebuild the web app on change
npm start          # server (restart it after editing src/)
npm run check      # typecheck + tests
```

| Path | |
| --- | --- |
| `src/server.ts` | HTTP(S) server and routes |
| `src/ocr.ts` | ONNX inference, ImageMagick, tesseract |
| `src/decode.ts` | OCR text → set code, voting |
| `src/cardcluster.ts` | CardCluster API client and cache |
| `src/exporters.ts` | CSV formats |
| `src/queue.ts` | Scan list |
| `web/` | Phone UI (TypeScript, bundled with esbuild into `public/app.js`) |
| `test/` | `node:test` suites, including OCR on real crops |

## Limitations

- Older French prints whose prefix differs from the English one (e.g. `LDD-F001` for LOB) are not handled yet.
- Card condition is not tracked: CardCluster applies its default, and Dragon Shield gets `NearMint`.
- The "Photo" mode (tesseract) is less reliable than the live scan.

## Disclaimer

This project is not affiliated with Konami, CardCluster or Dragon Shield.
It only reads CardCluster's public endpoints, caches them (sets for a day, set list for a week), and identifies itself with its own User-Agent.
Yu-Gi-Oh! is a trademark of Konami.

## License

[MIT](LICENSE)
