#!/bin/bash
# url_to_md.sh <url>
# Fetches a URL via jina.ai reader, saves as markdown to /files/, prints the file path.

set -e

URL="$1"
if [ -z "$URL" ]; then
  echo "Usage: url_to_md.sh <url>" >&2
  exit 1
fi

# Ensure URL has a scheme
if [[ "$URL" != http* ]]; then
  URL="https://$URL"
fi

# Derive filename from domain + date
DOMAIN=$(echo "$URL" | sed 's|https\?://||' | cut -d/ -f1 | sed 's/[^a-zA-Z0-9]/-/g')
DATE=$(date +%Y-%m-%d)
FILENAME="fetch-${DOMAIN}-${DATE}.md"
OUTFILE="/files/${FILENAME}"

# Fetch via jina.ai reader
curl -s -L --max-time 30 -H 'Accept: text/markdown' "https://r.jina.ai/${URL}" -o "$OUTFILE"

if [ ! -s "$OUTFILE" ]; then
  echo "Error: empty response from jina.ai" >&2
  exit 1
fi

echo "$OUTFILE"
