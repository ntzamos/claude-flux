#!/bin/bash
# Send an email via Resend, with optional file attachments.
# Usage: bash /home/relay/app/actions/send_email.sh <to> <subject> <body> [file1] [file2] ...
# Example: bash /home/relay/app/actions/send_email.sh user@example.com "Hello" "Body" /files/report.pdf

TO="$1"
SUBJECT="$2"
BODY="$3"
shift 3

if [ -z "$TO" ] || [ -z "$SUBJECT" ] || [ -z "$BODY" ]; then
  echo "Error: Usage: send_email.sh <to> <subject> <body> [file1] [file2] ..."
  exit 1
fi

API_KEY="${RESEND_API_KEY}"
FROM="${RESEND_FROM_EMAIL}"

if [ -z "$API_KEY" ] || [ -z "$FROM" ]; then
  echo "Error: RESEND_API_KEY and RESEND_FROM_EMAIL must be set"
  exit 1
fi

# Build JSON via Node.js — handles escaping and base64 encoding safely
TMPSCRIPT=$(mktemp /tmp/send_email_XXXXXX.js)
# Pass file list as JSON array via env var
FILES_JSON=$(node -e "
  const args = process.argv.slice(1);
  console.log(JSON.stringify(args));
" -- "$@")

cat > "$TMPSCRIPT" << 'NODEEOF'
const fs = require('fs');
const path = require('path');

const from    = process.env.FROM;
const to      = process.env.TO;
const subject = process.env.SUBJECT;
const body    = process.env.BODY;
const files   = JSON.parse(process.env.FILES_JSON || '[]');

const payload = { from, to: [to], subject, text: body };

if (files.length > 0) {
  payload.attachments = files.map(f => {
    if (!fs.existsSync(f)) {
      process.stderr.write('File not found: ' + f + '\n');
      process.exit(1);
    }
    return { filename: path.basename(f), content: fs.readFileSync(f).toString('base64') };
  });
}

process.stdout.write(JSON.stringify(payload));
NODEEOF

JSON=$(FROM="$FROM" TO="$TO" SUBJECT="$SUBJECT" BODY="$BODY" FILES_JSON="$FILES_JSON" node "$TMPSCRIPT" 2>&1)
EXIT_CODE=$?
rm -f "$TMPSCRIPT"

if [ $EXIT_CODE -ne 0 ]; then
  echo "Error building payload: $JSON"
  exit 1
fi

RESPONSE=$(curl -s -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$JSON")

EMAIL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1)
if [ -n "$EMAIL_ID" ]; then
  echo "Email sent successfully. $EMAIL_ID"
else
  echo "Error sending email: $RESPONSE"
  exit 1
fi
