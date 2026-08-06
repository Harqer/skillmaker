#!/usr/bin/env bash
# Build the deep-research runner into backend/go/bin/. The binary is gitignored;
# the bridge auto-discovers it via ABSO_RAVEN_GO_BIN or backend/go/bin.
set -euo pipefail
cd "$(dirname "$0")"

resolve_go() {
	if command -v go >/dev/null 2>&1; then
		printf 'go'
		return 0
	fi
	for c in "$HOME/go/bin/go" /usr/local/go/bin/go /usr/lib/go/bin/go; do
		if [ -x "$c" ]; then
			printf '%s' "$c"
			return 0
		fi
	done
	return 1
}

GO_BIN="$(resolve_go)"
if [ -z "$GO_BIN" ]; then
	echo "error: no go toolchain found on PATH or in common locations" >&2
	exit 1
fi

mkdir -p bin
"$GO_BIN" build -o bin/deep-research-runner .
echo "built bin/deep-research-runner"
