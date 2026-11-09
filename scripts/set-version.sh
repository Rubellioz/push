#!/usr/bin/env bash
# Stamp every script/style URL with ?v=<version> so phones never mix old and
# new files after a deploy. Usage: scripts/set-version.sh 5
set -euo pipefail
v="${1:?usage: set-version.sh <version>}"
cd "$(dirname "$0")/.."
# module imports:  from './x.js'  /  from './x.js?v=3'
sed -i -E "s#(from '[^']+\.js)(\?v=[0-9]+)?'#\1?v=${v}'#g" js/*.js js/*/*.js
# entry points in index.html
sed -i -E "s#(href=\"css/style\.css)(\?v=[0-9]+)?\"#\1?v=${v}\"#; s#(src=\"js/main\.js)(\?v=[0-9]+)?\"#\1?v=${v}\"#" index.html
# service worker cache name (a changed sw.js also triggers the update)
sed -i -E "s#const CACHE = 'push-v[0-9]+';#const CACHE = 'push-v${v}';#" sw.js
echo "version ${v}"
