#!/usr/bin/env bash
set -euo pipefail

source_icon="${1:-public/logotok.png}"
destination_icon="${2:-ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png}"

if [[ ! -f "$source_icon" ]]; then
  echo "Missing canonical TOK logo: $source_icon" >&2
  exit 66
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

resized="$tmp_dir/resized.png"
padded="$tmp_dir/padded.png"
opaque_jpeg="$tmp_dir/opaque.jpg"

mkdir -p "$(dirname "$destination_icon")"

# Keep the complete logo visible inside Apple's square icon canvas.
sips -Z 928 "$source_icon" --out "$resized" >/dev/null
sips -p 1024 1024 --padColor FFFFFF "$resized" --out "$padded" >/dev/null

# JPEG is used only as a lossless-enough flattening intermediary to guarantee
# that the final App Store PNG has no alpha channel. The canonical source
# remains public/logotok.png.
sips -s format jpeg -s formatOptions 100 "$padded" --out "$opaque_jpeg" >/dev/null
sips -s format png "$opaque_jpeg" --out "$destination_icon" >/dev/null

width="$(sips -g pixelWidth "$destination_icon" | awk '/pixelWidth/{print $2}')"
height="$(sips -g pixelHeight "$destination_icon" | awk '/pixelHeight/{print $2}')"

if [[ "$width" != "1024" || "$height" != "1024" ]]; then
  echo "Generated App Store icon must be 1024x1024, got ${width}x${height}." >&2
  exit 65
fi

echo "Generated $destination_icon from $source_icon (${width}x${height}, opaque)."
