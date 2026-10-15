#!/usr/bin/env bash
# Reproduce the verified Codex cloud development dependencies without deployment.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
node -e "if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Cloud setup requires Node.js 24+ for native environment-proxy support')"

export npm_config_cache="${npm_config_cache:-$repo_root/.npm}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_root/.cache/cloud-config}"
export WRANGLER_SEND_METRICS=false
npm ci --no-audit --no-fund
npm --prefix workers/remote-mcp ci --no-audit --no-fund
npm --prefix workers/remote-mcp run check -- --env staging

# The managed image provides Playwright through NODE_PATH and system Chromium.
# Keep this adapter local and ignored; the application and browser test stay intact.
if [[ -x /usr/bin/chromium ]] && node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  mkdir -p .cache/cloud-setup
  cat > .cache/cloud-setup/playwright-system.cjs <<'JS'
const playwright = require('playwright');
module.exports = {
  ...playwright,
  chromium: {
    launch: (options = {}) => playwright.chromium.launch({ ...options, executablePath: '/usr/bin/chromium' }),
  },
};
JS
  printf '%s\n' 'Browser adapter prepared at .cache/cloud-setup/playwright-system.cjs'
else
  printf '%s\n' 'Optional browser QA needs Playwright and Chromium; see docs/CLOUD_ENVIRONMENT.md.'
fi
