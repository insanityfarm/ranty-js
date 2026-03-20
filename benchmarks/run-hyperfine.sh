#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKLOAD_DIR="$ROOT_DIR/benchmarks/workloads"
RESULTS_PATH="$ROOT_DIR/benchmarks/latest-results.json"
NODE_BIN="${NODE_BIN:-node}"
CLI_PATH="$ROOT_DIR/dist/ranty.js"

if ! command -v hyperfine >/dev/null 2>&1; then
  echo "hyperfine is required but was not found in PATH" >&2
  exit 1
fi

if [[ ! -f "$CLI_PATH" ]]; then
  echo "Built JS CLI not found at $CLI_PATH" >&2
  echo "Run: npm run build" >&2
  exit 1
fi

rm -f "$RESULTS_PATH"

hyperfine \
  --style basic \
  --time-unit millisecond \
  --warmup 3 \
  --runs 20 \
  --input null \
  --output pipe \
  --export-json "$RESULTS_PATH" \
  -N \
  --command-name selector_ping_repeater \
  "$NODE_BIN $CLI_PATH --no-debug --no-warnings --seed c0ffee $WORKLOAD_DIR/selector_ping_repeater.ranty" \
  --command-name temporal_labeled_cartesian_call \
  "$NODE_BIN $CLI_PATH --no-debug --no-warnings --seed 1 $WORKLOAD_DIR/temporal_labeled_cartesian_call.ranty" \
  --command-name collection_callback_pipeline \
  "$NODE_BIN $CLI_PATH --no-debug --no-warnings --seed 1 $WORKLOAD_DIR/collection_callback_pipeline.ranty" \
  --command-name unicode_reverse_repeater \
  "$NODE_BIN $CLI_PATH --no-debug --no-warnings --seed 1 $WORKLOAD_DIR/unicode_reverse_repeater.ranty" \
  --command-name module_require_fanout \
  "$NODE_BIN $CLI_PATH --no-debug --no-warnings --seed 1 $WORKLOAD_DIR/module_require_fanout.ranty"

echo "Results written to benchmarks/latest-results.json"
