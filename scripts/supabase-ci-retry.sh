#!/usr/bin/env bash
set -euo pipefail

supabase_ci_assert_current_production_head() {
  if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
    return 0
  fi

  case "${GITHUB_REF_NAME:-}" in
    main|master) ;;
    *) return 0 ;;
  esac

  if [[ -z "${GITHUB_SHA:-}" ]]; then
    echo "::error::Refusing Supabase production deploy because GITHUB_SHA is missing."
    return 1
  fi

  local remote_sha
  if ! remote_sha="$(git ls-remote --heads origin "refs/heads/${GITHUB_REF_NAME}" | awk 'NR == 1 { print $1 }')"; then
    echo "::error::Unable to resolve the current ${GITHUB_REF_NAME} head; refusing Supabase production deploy."
    return 1
  fi

  if [[ -z "$remote_sha" ]]; then
    echo "::error::Current ${GITHUB_REF_NAME} head resolved to an empty SHA; refusing Supabase production deploy."
    return 1
  fi

  if [[ "$remote_sha" != "$GITHUB_SHA" ]]; then
    echo "::error::Refusing Supabase production deploy from stale commit ${GITHUB_SHA}; current ${GITHUB_REF_NAME} is ${remote_sha}. Let the newer production workflow deploy instead."
    return 1
  fi
}

supabase_ci_retry() {
  supabase_ci_assert_current_production_head || return $?

  if [[ "${1:-}" == "functions" ]] && [[ "${2:-}" == "deploy" ]]; then
    supabase_ci_deploy_functions_individually "${@:3}"
    return $?
  fi

  supabase_ci_retry_command "generic" "$@"
}

supabase_ci_retry_command() {
  local command_kind="$1"
  shift

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

    # The Supabase function deploy endpoint can report this exact conflict when
    # the deployment for the isolated function slug already exists. Accept it
    # only for a single-function deploy; no other Supabase command may turn a
    # generic 409 into success.
    if [[ "$command_kind" == "function-deploy" ]] \
      && supabase_ci_is_existing_deployment "$output"; then
      echo "Supabase reports that this Edge Function deployment already exists; treating the isolated function deploy as an idempotent success."
      rm -f "$output_file"
      return 0
    fi

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

supabase_ci_deploy_functions_individually() {
  local -a function_names=()
  local -a deploy_options=()
  local parsing_options=false
  local argument

  for argument in "$@"; do
    if [[ "$argument" == --* ]]; then
      parsing_options=true
    fi

    if [[ "$parsing_options" == "true" ]]; then
      deploy_options+=("$argument")
    else
      function_names+=("$argument")
    fi
  done

  if (( ${#function_names[@]} == 0 )); then
    while IFS= read -r function_path; do
      function_names+=("$(basename "$function_path")")
    done < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_shared' -print | sort)
  fi

  if (( ${#function_names[@]} == 0 )); then
    echo "::error::No Supabase Edge Function directory was found."
    return 1
  fi

  local function_name
  for function_name in "${function_names[@]}"; do
    if [[ ! "$function_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
      echo "::error::Invalid Edge Function name: $function_name"
      return 1
    fi
    if [[ ! -d "supabase/functions/$function_name" ]]; then
      echo "::error::Edge Function '$function_name' does not exist locally."
      return 1
    fi

    echo "Deploying Edge Function idempotently: $function_name"
    supabase_ci_retry_command \
      "function-deploy" \
      functions deploy "$function_name" "${deploy_options[@]}"
  done
}

supabase_ci_is_existing_deployment() {
  local output="$1"
  [[ "$output" =~ deployment[[:space:]]+already[[:space:]]+exists ]]
}

supabase_ci_is_transient_error() {
  local output="$1"
  [[ "$output" =~ (error\ code:\ (429|500|502|503|504)|Unexpected\ error\ retrieving\ remote\ project\ status|timeout|timed\ out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EOF|TLS\ handshake) ]]
}
