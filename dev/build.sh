#!/usr/bin/env bash
#
# Builds the two files Squarespace loads.
#
#   ./dev/build.sh            build once
#   ./dev/build.sh --watch    rebuild on every save, Ctrl-C to stop
#
# Note: index.html loads the css/ and js/ sources directly, so local previewing
# needs no build at all — just save and refresh. You only need dist/ when
# pushing to Squarespace.
#
# Order is the whole point:
#   CSS  tokens first, then components.
#   JS   core first (defines window.BC), components next, main LAST — main is
#        the only file that *does* something when it evaluates.

set -euo pipefail

cd "$(dirname "$0")/.."

CSS_FILES=(css/main.css css/header.css css/notices.css css/calendar.css css/creative.css css/quotes.css css/faq.css)
JS_FILES=(js/core.js js/header.js js/calendar.js js/calendar-extension.js js/creative.js js/quotes.js js/faq.js js/main.js)

build() {
  mkdir -p dist

  # Clear the intermediates even if a previous run was interrupted part-way.
  trap 'rm -f dist/bc.css dist/bc.js' RETURN

  # dist/ is a sibling of css/ and img/, so url(../img/...) keeps resolving.
  cat "${CSS_FILES[@]}" > dist/bc.css

  # Source stays debuggable; the build does not ship console noise.
  cat "${JS_FILES[@]}" | sed 's/debug: true/debug: false/' > dist/bc.js

  # npx --yes fetches esbuild into npm's own cache. Nothing is added to this
  # repo: no package.json, no node_modules.
  if npx --yes esbuild --version >/dev/null 2>&1; then
    # No --bundle. These are plain IIFEs, and CSS url() must be left exactly as
    # authored — bundling would resolve it against the output directory.
    npx --yes esbuild dist/bc.css --minify --outfile=dist/bc.min.css >/dev/null 2>&1
    npx --yes esbuild dist/bc.js  --minify --outfile=dist/bc.min.js  >/dev/null 2>&1
    MINIFIED=yes
  else
    cp dist/bc.css dist/bc.min.css
    cp dist/bc.js  dist/bc.min.js
    MINIFIED=no
  fi

  rm -f dist/bc.css dist/bc.js
}

report() {
  local label=$1 built=$2; shift 2
  local raw=0 out
  for f in "$@"; do raw=$((raw + $(wc -c < "$f"))); done
  out=$(wc -c < "$built")
  printf '%-18s %7.1fK  %7.1fK  %d%%\n' "$label" \
    "$(echo "scale=2; $raw/1024" | bc)" "$(echo "scale=2; $out/1024" | bc)" \
    "$(( 100 - (out * 100 / raw) ))"
}

summary() {
  echo
  if [[ $MINIFIED == yes ]]; then
    echo "minified with esbuild $(npx --yes esbuild --version)"
  else
    echo "esbuild unreachable (offline?) — shipping concatenated, unminified"
  fi

  echo
  printf '%-18s %8s  %8s  %s\n' "" "source" "built" "saved"
  report "dist/bc.min.css" dist/bc.min.css "${CSS_FILES[@]}"
  report "dist/bc.min.js"  dist/bc.min.js  "${JS_FILES[@]}"

  echo
  if grep -q 'debug:!1\|debug: false' dist/bc.min.js; then
    echo "debug: off in build (source untouched)"
  else
    echo "WARNING: debug flag not disabled in build — check the sed above"
  fi
}

# A checksum of every source file's size and mtime. Cheaper than hashing the
# contents, and polling avoids depending on fswatch or a node watcher.
fingerprint() {
  stat -f '%m %z %N' "${CSS_FILES[@]}" "${JS_FILES[@]}" 2>/dev/null | cksum
}

# Prints the injection lines pinned to the pushed commit. Pinning is not just
# a launch step: jsDelivr caches the @main -> commit resolution for up to 12
# hours, and purging a FILE does not refresh that mapping. A pinned URL is
# always the current build the moment it is pushed.
if [[ "${1:-}" == "--urls" ]]; then
  sha=$(git rev-parse --short origin/main 2>/dev/null || echo "")

  if [[ -z "$sha" ]]; then
    echo "no origin/main — push first" >&2
    exit 1
  fi

  if [[ -n "$(git status --porcelain dist/)" ]]; then
    echo "WARNING: dist/ has uncommitted changes — these URLs serve the pushed build, not your working tree" >&2
    echo >&2
  fi

  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    echo "WARNING: local HEAD differs from origin/main — commit and push first" >&2
    echo >&2
  fi

  base="https://cdn.jsdelivr.net/gh/arisrpm/billy806@${sha}/dist"
  echo "<link rel=\"stylesheet\" href=\"${base}/bc.min.css\">"
  echo "<script defer src=\"${base}/bc.min.js\"></script>"
  exit 0
fi

if [[ "${1:-}" == "--watch" ]]; then
  echo "watching ${#CSS_FILES[@]} css + ${#JS_FILES[@]} js files — Ctrl-C to stop"
  last=""
  while true; do
    now=$(fingerprint)
    if [[ "$now" != "$last" ]]; then
      last=$now
      build
      printf '  %s  rebuilt  %sK css  %sK js\n' \
        "$(date +%H:%M:%S)" \
        "$(echo "scale=1; $(wc -c < dist/bc.min.css)/1024" | bc)" \
        "$(echo "scale=1; $(wc -c < dist/bc.min.js)/1024" | bc)"
    fi
    sleep 0.5
  done
fi

# A build that produces an empty or truncated bundle is worse than one that
# fails: it commits and deploys cleanly and the site simply loses styling.
# This has happened once — bc.min.css was committed at 0 bytes.
verify() {
  local bad=0

  for f in dist/bc.min.css dist/bc.min.js; do
    if [[ ! -s $f ]]; then
      echo "BUILD FAILED: $f is empty" >&2
      bad=1
    elif [[ $(wc -c < "$f") -lt 2000 ]]; then
      echo "BUILD FAILED: $f is only $(wc -c < "$f") bytes — truncated?" >&2
      bad=1
    fi
  done

  # One signature selector per stylesheet, each unique to that file — a bare
  # "bc-creative" also appears in main.css, so it would pass even with
  # creative.css dropped from the list.
  for sel in bc-header__menu bc-notices__grid bc-calendar__grid bc-creative__dialog bc-quotes__list bc-faq__panel; do
    grep -q "$sel" dist/bc.min.css || { echo "BUILD FAILED: no '$sel' rules in bc.min.css" >&2; bad=1; }
  done

  for name in BCHeader BCCalendar BCCreative BCQuotes BCFAQ; do
    grep -q "window.$name=" dist/bc.min.js || { echo "BUILD FAILED: $name missing from bc.min.js" >&2; bad=1; }
  done

  if [[ $bad -ne 0 ]]; then
    echo >&2
    echo "dist/ left in place — do NOT commit it. Fix the above and rebuild." >&2
    exit 1
  fi
}

build
verify
summary
