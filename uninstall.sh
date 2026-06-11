#!/usr/bin/env bash
# ai — uninstall script
#
# Removes the ai coding agent completely from your system.
# This deletes:
#   - The installed binary at ~/.ai/bin/ai (and symlinks)
#   - The global npm package @simpletoolsindiaorg/ai-coding-agent
#   - All user data at ~/.ai/agent/ (models, sessions, auth, settings, skills)
#   - The package cache at ~/.ai/packages/
#
# Usage:
#   bash uninstall.sh          # Interactive (asks before deleting user data)
#   bash uninstall.sh --force  # Non-interactive (deletes everything)
#
# After uninstalling, you can reinstall at any time:
#   curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash

set -euo pipefail

FORCE=false
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
	FORCE=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${GREEN}  ai uninstaller${NC}"
echo ""

# ── Check if installed ──────────────────────────────────

AI_BIN="$HOME/.ai/bin/ai"
if [ ! -f "$AI_BIN" ]; then
	echo -e "${YELLOW}  ai is not installed (no ~/.ai/bin/ai found).${NC}"
	echo -e "${DIM}  Nothing to uninstall.${NC}"
	exit 0
fi

AI_VERSION="$("$AI_BIN" --version 2>/dev/null || echo "unknown")"
echo -e "  Found: ai v${AI_VERSION} at $AI_BIN"
echo ""

# ── Confirm ─────────────────────────────────────────────

if [ "$FORCE" = false ]; then
	echo -e "${YELLOW}  This will remove:${NC}"
	echo -e "    • ai binary (~/.ai/bin/ai)"
	echo -e "    • npm package (@simpletoolsindiaorg/ai-coding-agent)"
	echo -e "    • All user data (~/.ai/agent/) — models, auth, settings, skills, sessions"
	echo -e "    • Package cache (~/.ai/packages/)"
	echo ""
	read -r -p "  Continue? [y/N] " response
	if [ "${response,,}" != "y" ] && [ "${response,,}" != "yes" ]; then
		echo -e "${DIM}  Cancelled.${NC}"
		exit 0
	fi
fi

# ── Uninstall ───────────────────────────────────────────

echo ""
echo -e "${DIM}  Removing npm package...${NC}"
npm uninstall -g @simpletoolsindiaorg/ai-coding-agent 2>/dev/null || true

echo -e "${DIM}  Removing symlinks...${NC}"
rm -f /opt/homebrew/bin/ai 2>/dev/null || true
rm -f /usr/local/bin/ai 2>/dev/null || true

echo -e "${DIM}  Removing ~/.ai...${NC}"
if [ -d "$HOME/.ai" ]; then
	rm -rf "$HOME/.ai"
	echo -e "    ✓ ~/.ai removed"
fi

echo ""
echo -e "${GREEN}  ✓ ai v${AI_VERSION} uninstalled successfully.${NC}"
echo ""
echo -e "${DIM}  To reinstall later:${NC}"
echo -e "    curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash"
echo ""
