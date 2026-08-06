# Logos

Drop a file here with the exact name below and the tile picks it up on next load.
Until then the tile shows a monogram, which is a deliberate state rather than a
broken image.

| File | Tile | Status |
| --- | --- | --- |
| `schwab.webp` | Schwab | in place, 133x68, displays at 34px |
| `july.webp` | JULY Services | in place, 169x60, displays at 30px |
| `flourish.webp` | Flourish Cash | in place, 72x72, displays at 36px |
| `paynet.webp` | Pay-Net Online | in place, 103x68, displays at 34px |
| `passwords.webp` | Password manager | monogram |
| `email.webp` | Email and calendar | monogram |

Display height is set per logo in the `employee.tiles` block in `index.html`, not
in CSS, because a square icon and a long wordmark need different heights to look
like they belong on the same row. Export at twice the display height.

## Getting the files

Take them from each company's own brand, press, or media-kit page rather than an
image search, so you get a clean transparent original rather than something
rescaled off a screenshot. Horizontal lockups work better than square marks here,
since the tile gives them a wide 34px-tall slot.

## Converting to webp

Tiles display at 34px tall, so export at 68px for sharpness on retina screens.

```sh
# Google's encoder, best quality control
cwebp -q 90 -resize 0 68 schwab.png -o schwab.webp

# ImageMagick
magick schwab.png -resize x68 -quality 90 schwab.webp

# macOS, no install needed
sips -s format webp -Z 68 schwab.png --out schwab.webp
```

Keep each file under about 15KB. If a logo is dark, check it against the near-white
tile background; most brand kits include a version that works on light.

## One thing to check first

These are other companies' trademarks. Using them to label a link to that company's
own service on an internal page is ordinary identification, not a claim of
endorsement, but custodian and vendor agreements sometimes carry their own brand
usage terms. Schwab in particular publishes guidelines for how advisors may use its
name and marks. Worth two minutes of Brad's time before this goes up, and none of
this is legal advice.
