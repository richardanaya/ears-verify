#!/bin/sh
# Install the pinned ScriptC compiler and check the version.
# Method: npm exact devDependency (scriptc@0.4.1), which pulls the
# platform package @scriptc/cli-<os>-<arch> at the same version and
# runs scripts/install-native.mjs on postinstall.
# Lockfile: package-lock.json (npm ci reproduces this tree).
set -eu
cd "$(dirname "$0")/.."
npm install --save-dev --save-exact scriptc@0.4.1
npm install-scripts approve scriptc@0.4.1 || true
version="$(npx scriptc --version | tr -d '\r')"
echo "scriptc ${version}"
if [ "$version" != "0.4.1" ]; then
  echo "expected scriptc 0.4.1" >&2
  exit 1
fi
