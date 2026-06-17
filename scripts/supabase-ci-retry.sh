#!/usr/bin/env bash
set -euo pipefail

supabase_ci_retry() {
  local attempt=1
  local max_attempts="${SUPABASE_CLI_RETRY_ATTEMPTS:-4}"
  local delay_seconds="${SUPABASE_CLI_RETRY_DELAY_SECONDS:-20}"
  local output_file
  output_file="$(mktemp)"

  while true; do
    : > "$output_file"

    set +e
    pnpm dlx "supabase@${SUPABASE_CLI_VERSION}" "$@" 2>&1 | tee "$output_file"
    local status="${PIPESTATUS[0]}"
    set -e

    if [[ "$status" -eq 0 ]]; then
      rm -f "$output_file"
      return 0
    fi

    local output
    output="$(cat "$output_file")"
    if [[ "$attempt" -ge "$max_attempts" ]] || ! supabase_ci_is_transient_error "$output"; then
      rm -f "$output_file"
      return "$status"
    fi

    local sleep_seconds=$((delay_seconds * attempt))
    echo "Supabase CLI command failed with a transient platform or network error (attempt ${attempt}/${max_attempts}). Retrying in ${sleep_seconds}s..."
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done
}

supabase_ci_is_transient_error() {
  local output="$1"
  [[ "$output" =~ (error\ code:\ (429|500|502|503|504)|Unexpected\ error\ retrieving\ remote\ project\ status|timeout|timed\ out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EOF|TLS\ handshake) ]]
}
