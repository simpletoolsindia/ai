#!/usr/bin/env bash
# ai — uninstall script
#
# Removes the ai coding agent from your system.
# By default this is a SAFE uninstall: it keeps your user data so that
# a subsequent reinstall picks up your auth keys, model config, and
# session history. Add --purge to also delete user data.
#
# This deletes by default:
#   - The installed binary at ~/.ai/bin/ai (and symlinks)
#   - The cloned source at ~/.ai/source/ (if present)
#   - The npm package @simpletoolsindiaorg/ai-coding-agent
#
# This deletes with --purge:
#   - All user data at ~/.ai/agent/ (models, sessions, auth, settings, skills)
#
# Usage:
#   bash uninstall.sh            # Interactive; preserves user data
#   bash uninstall.sh --force    # Non-interactive; preserves user data
#   bash uninstall.sh --purge    # Also wipes user data
#   bash uninstall.sh --force --purge   # Non-interactive + full wipe
#
# After uninstalling, you can reinstall at any time:
#   curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash

set -euo pipefail

FORCE=false
PURGE=false
for arg in "$@"; do
	case "$arg" in
		--force|-f) FORCE=true ;;
		--purge) PURGE=true ;;
		--help|-h)
			echo "Usage: bash uninstall.sh [--force] [--purge]"
			echo "  --force   Non-interactive"
			echo "  --purge   Also remove user data at ~/.ai/agent/"
			exit 0
			;;
		*) echo "Unknown option: $arg" >&2; exit 1 ;;
	esac
done

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
AI_SOURCE="$HOME/.ai/source"

found_any=false
if [ -f "$AI_BIN" ]; then
	AI_VERSION="$("$AI_BIN" --version 2>/dev/null || echo "unknown")"
	echo -e "  Found: ai v${AI_VERSION} at $AI_BIN"
	found_any=true
fi
if [ -d "$AI_SOURCE" ]; then
	echo -e "  Found source: $AI_SOURCE"
	found_any=true
fi

if [ "$found_any" = false ]; then
	echo -e "${YELLOW}  ai is not installed (no ~/.ai/bin/ai or ~/.ai/source found).${NC}"
	echo -e "${DIM}  Nothing to uninstall.${NC}"
	exit 0
fi

echo ""

# ── Confirm ─────────────────────────────────────────────

if [ "$FORCE" = false ]; then
	echo -e "${YELLOW}  This will remove:${NC}"
	echo -e "    • ai binary (~/.ai/bin/ai)"
	echo -e "    • source checkout (~/.ai/source/)"
	echo -e "    • npm package (@simpletoolsindiaorg/ai-coding-agent)"
	if [ "$PURGE" = true ]; then
		echo -e "    ${RED}• ALL USER DATA at ~/.ai/agent/ (--purge)${NC}"
	else
		echo -e "    ${DIM}• user data at ~/.ai/agent/ (preserved — use --purge to wipe)${NC}"
	fi
	echo ""
	if [ "$PURGE" = true ]; then
		read -r -p "  Continue (with --purge)? [y/N] " response
	else
		read -r -p "  Continue (user data will be preserved)? [y/N] " response
	fi
	if [ "${response,,}" != "y" ] && [ "${response,,}" != "yes" ]; then
		echo -e "${DIM}  Cancelled.${NC}"
		exit 0
	fi
fi

# ── Backup user data before any destructive operation ────

# Always create a timestamped backup of ~/.ai/agent before uninstalling.
# This is the safety net for bug 2: even if the user later discovers they
# needed the auth keys, the backup is in ~/.ai.backup-<timestamp>/.
BACKUP_ROOT="$HOME"
BACKUP_NAME="ai.backup-$(date +%Y%m%d-%H%M%S)"
if [ -d "$HOME/.ai/agent" ] && [ "$PURGE" = false ]; then
	BACKUP_PATH="$BACKUP_ROOT/$BACKUP_NAME"
	mkdir -p "$BACKUP_PATH"
	if cp -a "$HOME/.ai/agent" "$BACKUP_PATH/agent" 2>/dev/null; then
		echo -e "${DIM}  Backed up ~/.ai/agent/ to ~/${BACKUP_NAME}/agent/${NC}"
		# Keep at most 5 most recent backups; prune the rest.
		ls -1dt "$BACKUP_ROOT"/ai.backup-* 2>/dev/null | tail -n +6 | while read -r old; do
			rm -rf "$old"
		done
	else
		echo -e "${YELLOW}  Warning: could not back up ~/.ai/agent/ (cp failed). Continuing.${NC}"
	fi
fi

# ── Uninstall ───────────────────────────────────────────

echo ""
echo -e "${DIM}  Removing npm package...${NC}"
npm uninstall -g @simpletoolsindiaorg/ai-coding-agent 2>/dev/null || true

echo -e "${DIM}  Removing symlinks...${NC}"
rm -f /opt/homebrew/bin/ai 2>/dev/null || true
rm -f /usr/local/bin/ai 2>/dev/null || true

echo -e "${DIM}  Removing ~/.ai/source/...${NC}"
if [ -d "$HOME/.ai/source" ]; then
	rm -rf "$HOME/.ai/source"
	echo -e "    ✓ ~/.ai/source removed"
fi

echo -e "${DIM}  Removing ~/.ai/bin/...${NC}"
if [ -d "$HOME/.ai/bin" ]; then
	rm -rf "$HOME/.ai/bin"
	echo -e "    ✓ ~/.ai/bin removed"
fi

if [ "$PURGE" = true ]; then
	echo -e "${DIM}  Removing ~/.ai/agent/ (--purge)...${NC}"
	if [ -d "$HOME/.ai/agent" ]; then
		rm -rf "$HOME/.ai/agent"
		echo -e "    ✓ ~/.ai/agent removed"
	fi
else
	if [ -d "$HOME/.ai/agent" ]; then
		echo ""
		echo -e "  ${GREEN}✓ Preserved user data at ~/.ai/agent/${NC}"
		echo -e "  ${DIM}  (auth.json, models.json, settings.json, sessions/)${NC}"
	fi
fi

# If ~/.ai is now empty, remove it. Otherwise keep it for the user data.
if [ -d "$HOME/.ai" ] && [ -z "$(ls -A "$HOME/.ai" 2>/dev/null)" ]; then
	rmdir "$HOME/.ai"
fi

echo ""
echo -e "${GREEN}  ✓ ai v${AI_VERSION:-unknown} uninstalled successfully.${NC}"
if [ -d "$BACKUP_PATH" ] 2>/dev/null; then
	echo -e "${DIM}  Backup: ~/${BACKUP_NAME}/agent/${NC}"
fi
echo ""
echo -e "${DIM}  To reinstall later (preserves data by default):${NC}"
echo -e "${DIM}    curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai/main/install.sh | bash${NC}"
echo ""
