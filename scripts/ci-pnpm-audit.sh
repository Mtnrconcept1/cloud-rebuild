#!/usr/bin/env bash
set -euo pipefail

max_attempts="${PNPM_AUDIT_MAX_ATTEMPTS:-3}"
retry_delay_seconds="${PNPM_AUDIT_RETRY_DELAY_SECONDS:-5}"
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

is_transport_decode_error() {
  grep -Eqi \
    "Unexpected token|not valid JSON|invalid json|gzip|incorrect header check|unexpected end of json input" \
    "$log_file"
}

for attempt in $(seq 1 "$max_attempts"); do
  : > "$log_file"
  echo "Running production dependency audit (attempt ${attempt}/${max_attempts})..."

  set +e
  npm_config_accept_encoding=identity \
    pnpm audit --prod --audit-level high 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}
  set -e

  if [[ "$status" -eq 0 ]]; then
    exit 0
  fi

  if ! is_transport_decode_error; then
    echo "::error title=Production dependency audit failed::pnpm audit reported an actionable dependency or registry error."
    exit "$status"
  fi

  if [[ "$attempt" -lt "$max_attempts" ]]; then
    echo "::warning title=pnpm audit response decode failure::The npm audit endpoint returned an unreadable compressed response. Retrying with identity encoding."
    sleep "$retry_delay_seconds"
  fi
done

echo "::warning title=Dependency audit temporarily unavailable::pnpm audit repeatedly received an unreadable gzip/JSON response from the npm registry. No vulnerability result was produced; lint, typecheck, tests and build will continue."
exit 0
