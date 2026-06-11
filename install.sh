#!/usr/bin/env bash
# install.sh - Cross-platform installer for the ai coding agent
#
# Supported: Linux, macOS, Windows (via Git Bash, WSL, or Cygwin)
#
# NOTE: The official prebuilt binaries are currently only published for
# macOS and Linux. The build itself runs on any platform that has Node 22.19+
# and the system deps. For Windows users, this script will build from source
# (which requires Git Bash or WSL, not cmd.exe or PowerShell directly).
#
# What this does:
#   1. Verifies Node.js >= 22.19 and npm
#   2. Clones the ai repo (or uses a local source directory)
#   3. Installs dependencies with --ignore-scripts (security)
#   4. Builds all 4 packages (tui → ai → agent → coding-agent)
#   5. Runs lint + typecheck + tests
#   6. Symlinks the `ai` binary to ~/.local/bin/ (or %USERPROFILE%\.local\bin\ on Windows)
#   7. Adds ~/.local/bin to PATH (with a hint if it isn't already)
#
# Usage:
#   ./install.sh                          # install latest from GitHub
#   ./install.sh --source /path/to/ai    # install from local source
#   ./install.sh --prefix ~/.ai          # install to custom prefix
#   ./install.sh --skip-tests             # skip lint/test (faster)
#   ./install.sh --skip-build             # skip rebuild (use prebuilt dist/)
#
# Re-run safely: detects existing installation and upgrades in place.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_URL="${AI_REPO_URL:-https://github.com/simpletoolsindia/ai.git}"
REPO_REF="${AI_REPO_REF:-main}"
PREFIX="${AI_PREFIX:-$HOME/.ai}"
BIN_DIR="${AI_BIN_DIR:-$PREFIX/bin}"
SOURCE_DIR=""
SKIP_TESTS=0
SKIP_BUILD=0
DRY_RUN=0
VERBOSE=0

NODE_MIN_MAJOR=22
NODE_MIN_MINOR=19
NPM_MIN_MAJOR=10

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Cross-platform: detect OS and emit a normalized name
detect_os() {
	local uname_s
	uname_s="$(uname -s 2>/dev/null || echo "Windows")"
	case "$uname_s" in
		Linux*)   echo "linux" ;;
		Darwin*)  echo "macos" ;;
		MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
		Windows*) echo "windows" ;;
		*)        echo "$uname_s" ;;
	esac
}

# Strip Windows-style path separator issues
normalize_path() {
	local p="$1"
	# Convert backslashes to forward slashes (for Windows paths under bash)
	p="${p//\\//}"
	echo "$p"
}

# Print colored output if stdout is a TTY and color is supported
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
	CLR_RED='\033[0;31m'
	CLR_GREEN='\033[0;32m'
	CLR_YELLOW='\033[0;33m'
	CLR_BLUE='\033[0;34m'
	CLR_BOLD='\033[1m'
	CLR_RESET='\033[0m'
else
	CLR_RED=''; CLR_GREEN=''; CLR_YELLOW=''; CLR_BLUE=''; CLR_BOLD=''; CLR_RESET=''
fi

log()      { printf "%b\n" "$*" >&2; }
info()    { log "${CLR_BLUE}==>${CLR_RESET} ${CLR_BOLD}$*${CLR_RESET}"; }
success() { log "${CLR_GREEN}✓${CLR_RESET} $*"; }
warn()    { log "${CLR_YELLOW}!${CLR_RESET} $*"; }
error()   { log "${CLR_RED}✗${CLR_RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

run() {
	if [ "$VERBOSE" -eq 1 ]; then
		"$@"
	else
		"$@" >/dev/null 2>&1
	fi
}

# Compare version strings (semver-ish: major.minor.patch)
# Returns: 0 if $1 >= $2, 1 otherwise
version_gte() {
	# Pad shorter with zeros, split on dots
	local v1="$1" v2="$2"
	while [ "${#v1}" -lt "${#v2}" ]; do v1="$v1.0"; done
	while [ "${#v2}" -lt "${#v1}" ]; do v2="$v2.0"; done
	[ "$v1" = "$v2" ] && return 0
	local IFS=.
	local v1_parts=($v1) v2_parts=($v2)
	local i
	for i in "${!v1_parts[@]}"; do
		local p1="${v1_parts[$i]:-0}"
		local p2="${v2_parts[$i]:-0}"
		# Strip non-numeric suffixes (e.g. "0.0.0-dev" → 0)
		p1="${p1%%[!0-9]*}"
		p2="${p2%%[!0-9]*}"
		p1="${p1:-0}"; p2="${p2:-0}"
		if [ "$p1" -gt "$p2" ]; then return 0; fi
		if [ "$p1" -lt "$p2" ]; then return 1; fi
	done
	return 0
}

usage() {
	cat <<'EOF'
install.sh — Cross-platform installer for the ai coding agent

Usage:
  ./install.sh [options]

Options:
  --source <path>      Install from local source directory instead of cloning
  --prefix <path>      Install prefix (default: $HOME/.ai)
  --bin-dir <path>     Directory for the `ai` symlink (default: $prefix/bin)
  --ref <ref>          Git ref to clone (default: main)
  --skip-tests         Skip lint, typecheck, and tests
  --skip-build         Skip the build (assumes dist/ is already populated)
  --dry-run            Print what would be done without making changes
  --verbose            Show all command output
  -h, --help           Show this help

Environment:
  AI_REPO_URL=<url>    Override the git URL
  AI_REPO_REF=<ref>    Override the git ref
  AI_PREFIX=<path>     Override the install prefix
  AI_BIN_DIR=<path>    Override the binary symlink directory

Examples:
  # Standard install (clones from GitHub, builds, tests, links)
  ./install.sh

  # Install from a local checkout (useful for development)
  ./install.sh --source .

  # Install to a custom location
  ./install.sh --prefix /opt/ai --bin-dir /usr/local/bin

  # Quick install without tests
  ./install.sh --skip-tests
EOF
}

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
	case "$1" in
		--source)    SOURCE_DIR="$2"; shift 2 ;;
		--prefix)    PREFIX="$2"; shift 2 ;;
		--bin-dir)   BIN_DIR="$2"; shift 2 ;;
		--ref)       REPO_REF="$2"; shift 2 ;;
		--skip-tests) SKIP_TESTS=1; shift ;;
		--skip-build) SKIP_BUILD=1; shift ;;
		--dry-run)   DRY_RUN=1; shift ;;
		--verbose|-v) VERBOSE=1; shift ;;
		-h|--help)   usage; exit 0 ;;
		*) die "Unknown option: $1 (try --help)";;
	esac
done

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------

info "Checking prerequisites"

# Need bash 3.2+ (we use arrays, but not associative ones, so 3.2 is enough)
if [ -z "${BASH_VERSION:-}" ]; then
	die "This installer requires bash. On Windows, install Git Bash or WSL."
fi

# Need Node.js
if ! command -v node >/dev/null 2>&1; then
	die "Node.js is not installed. Install Node.js >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}.0 from https://nodejs.org/"
fi

NODE_VERSION="$(node --version | sed 's/^v//')"
NODE_MAJOR="$(echo "$NODE_VERSION" | cut -d. -f1)"
NODE_MINOR="$(echo "$NODE_VERSION" | cut -d. -f2)"
if ! version_gte "${NODE_MAJOR}.${NODE_MINOR}.0" "${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}.0"; then
	die "Node.js >= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}.0 required, found $(node --version). Update from https://nodejs.org/"
fi
success "Node.js $(node --version)"

# Need npm
if ! command -v npm >/dev/null 2>&1; then
	die "npm is not installed. It usually comes with Node.js. Install it from https://www.npmjs.com/"
fi
NPM_VERSION="$(npm --version)"
NPM_MAJOR="$(echo "$NPM_VERSION" | cut -d. -f1)"
if [ "$NPM_MAJOR" -lt "$NPM_MIN_MAJOR" ]; then
	die "npm >= ${NPM_MIN_MAJOR}.0 required, found ${NPM_VERSION}. Run: npm install -g npm"
fi
success "npm ${NPM_VERSION}"

# Need git (only for non-local installs)
if [ -z "$SOURCE_DIR" ] && ! command -v git >/dev/null 2>&1; then
	die "git is not installed (needed to clone the repo). Install git from https://git-scm.com/"
fi

# OS detection
OS="$(detect_os)"
info "Detected OS: $OS"

# On Windows, warn if running under cmd/PowerShell instead of bash
if [ "$OS" = "windows" ] && [ -z "${MSYSTEM:-}${WSL_DISTRO_NAME:-}${OSTYPE_CYGWIN:-}" ]; then
	warn "You're on Windows but the bash environment isn't detected (MSYSTEM/WSL/Cygwin)."
	warn "Re-run this script from Git Bash, WSL, or Cygwin."
	warn "If you're using cmd.exe or PowerShell, this script won't work directly."
fi

# ---------------------------------------------------------------------------
# Step 2: Get the source
# ---------------------------------------------------------------------------

if [ -n "$SOURCE_DIR" ]; then
	# Local source mode
	SOURCE_DIR="$(normalize_path "$SOURCE_DIR")"
	if [ ! -d "$SOURCE_DIR" ]; then
		die "Source directory does not exist: $SOURCE_DIR"
	fi
	if [ ! -f "$SOURCE_DIR/package.json" ]; then
		die "Source directory does not look like the ai repo (no package.json at root): $SOURCE_DIR"
	fi
	info "Using local source: $SOURCE_DIR"
else
	# Clone mode
	# Use a temporary clone directory; we'll move it to the install prefix
	CLONE_PARENT="$(mktemp -d -t ai-install-XXXXXX)"
	SOURCE_DIR="$CLONE_PARENT/ai"
	info "Cloning $REPO_URL (ref: $REPO_REF) to $SOURCE_DIR"
	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] git clone --depth 1 --branch $REPO_REF $REPO_URL $SOURCE_DIR"
	else
		run git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$SOURCE_DIR" || \
			die "Failed to clone $REPO_URL. Check your network or use --source for local install."
	fi
fi

# cd is needed for npm install/build/test to work from the repo root,
# but in dry-run with clone mode the cloned dir doesn't exist yet.
if [ -d "$SOURCE_DIR" ]; then
	cd "$SOURCE_DIR" || die "Cannot cd to $SOURCE_DIR"
fi
info "Source directory: $SOURCE_DIR"

# ---------------------------------------------------------------------------
# Step 3: Install dependencies
# ---------------------------------------------------------------------------

info "Installing dependencies (npm install --ignore-scripts)"
if [ "$DRY_RUN" -eq 1 ]; then
	echo "  [dry-run] npm install --ignore-scripts"
else
	run npm install --ignore-scripts --no-audit --no-fund || \
		die "npm install failed. See errors above. Run with --verbose to see all output."
fi
success "Dependencies installed"

# ---------------------------------------------------------------------------
# Step 4: Build
# ---------------------------------------------------------------------------

if [ "$SKIP_BUILD" -eq 1 ]; then
	info "Skipping build (--skip-build)"
else
	info "Building packages (tui → ai → agent → coding-agent)"
	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] npm run build"
	else
		run npm run build || die "Build failed. See errors above. Run with --verbose."
	fi
	success "Build complete"
fi

# ---------------------------------------------------------------------------
# Step 5: Lint + test (optional)
# ---------------------------------------------------------------------------

if [ "$SKIP_TESTS" -eq 1 ]; then
	info "Skipping lint + tests (--skip-tests)"
else
	info "Running lint and typecheck (npm run check)"
	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] npm run check"
	else
		# Lint+typecheck+shrinkwrap; tests are run separately (can be slow + need network)
		run npm run check || warn "Lint/typecheck reported issues. Run \`npm run check\` to see details."
	fi

	info "Running tests"
	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] ./test.sh"
	else
		# Some tests need API keys; test.sh skips those automatically
		run ./test.sh || warn "Some tests failed. Run \`./test.sh\` to see details."
	fi
fi

# ---------------------------------------------------------------------------
# Step 6: Link the `ai` binary
# ---------------------------------------------------------------------------

# Resolve to absolute path so the symlink works regardless of cwd.
# In dry-run + clone mode the dir doesn't exist yet, so fall back to the path as-is.
if [ -d "$SOURCE_DIR" ]; then
	AI_BIN_PATH="$(cd "$SOURCE_DIR" && pwd)/packages/coding-agent/dist/cli.js"
else
	AI_BIN_PATH="$SOURCE_DIR/packages/coding-agent/dist/cli.js"
fi
if [ ! -f "$AI_BIN_PATH" ] && [ "$SKIP_BUILD" -eq 1 ]; then
	die "No prebuilt binary at $AI_BIN_PATH and --skip-build was set. Build first or remove --skip-build."
fi

info "Installing the 'ai' command to $BIN_DIR"
mkdir -p "$BIN_DIR"

# Cross-platform symlink command
make_symlink() {
	local target="$1"
	local link="$2"
	# Remove existing link or file
	[ -L "$link" ] || [ -f "$link" ] && rm -f "$link"
	if [ "$OS" = "windows" ]; then
		# On Windows under MSYS/Git Bash, ln works but creates a "MSYS" symlink
		# that other shells (cmd.exe) may not resolve. Use cmd's mklink if available;
		# otherwise fall back to a copy.
		if command -v cmd.exe >/dev/null 2>&1; then
			# Convert paths to Windows-style
			local win_target win_link
			win_target="$(cygpath -w "$target" 2>/dev/null || echo "$target")"
			win_link="$(cygpath -w "$link" 2>/dev/null || echo "$link")"
			if [ "$DRY_RUN" -eq 1 ]; then
				echo "  [dry-run] cmd.exe /c mklink $win_link $win_target"
			else
				# cmd's mklink with /D makes a directory symlink; /J makes a junction.
				# Junctions don't need admin and work in cmd/PowerShell.
				# Fall back to copy if mklink fails.
				cmd.exe /c "mklink /J \"$(echo "$win_link" | sed 's,/,\\\\,g')\" \"$(echo "$win_target" | sed 's,/,\\\\,g')\"" 2>/dev/null || \
					cp "$target" "$link" || \
					warn "Could not create junction or copy. Run \`ai\` from $SOURCE_DIR/packages/coding-agent/dist/ directly."
			fi
		else
			# No cmd.exe — just copy
			cp "$target" "$link"
		fi
	else
		# Unix: regular symlink
		if [ "$DRY_RUN" -eq 1 ]; then
			echo "  [dry-run] ln -sf $target $link"
		else
			ln -sf "$target" "$link"
		fi
	fi
}

make_symlink "$AI_BIN_PATH" "$BIN_DIR/ai"

success "Linked $BIN_DIR/ai -> $AI_BIN_PATH"

# ---------------------------------------------------------------------------
# Step 7: PATH hint
# ---------------------------------------------------------------------------

# Check if BIN_DIR is in PATH
case ":$PATH:" in
	*":$BIN_DIR:"*) in_path=1 ;;
	*) in_path=0 ;;
esac

# Detect shell rc file
detect_shell_rc() {
	local shell_name="${SHELL:-/bin/sh}"
	case "$shell_name" in
		*/bash)  [ -f "$HOME/.bashrc" ] && echo "$HOME/.bashrc" ;;
		*/zsh)   [ -f "$HOME/.zshrc" ] && echo "$HOME/.zshrc" ;;
		*/fish)  [ -f "$HOME/.config/fish/config.fish" ] && echo "$HOME/.config/fish/config.fish" ;;
		*/csh*|*/tcsh*) [ -f "$HOME/.cshrc" ] && echo "$HOME/.cshrc" ;;
		*) echo "" ;;
	esac
}

if [ "$in_path" -eq 0 ]; then
	warn "$BIN_DIR is not in your PATH"
	SHELL_RC="$(detect_shell_rc)"
	case "$SHELL" in
		*/fish)
			PATH_LINE="set -gx PATH \$PATH $BIN_DIR"
			;;
		*/csh*|*/tcsh*)
			PATH_LINE="setenv PATH \$PATH:$BIN_DIR"
			;;
		*)
			PATH_LINE="export PATH=\"\$PATH:$BIN_DIR\""
			;;
	esac
	echo
	echo "To make 'ai' available in new shells, add this line:"
	echo
	echo "  $PATH_LINE"
	if [ -n "$SHELL_RC" ]; then
		echo
		echo "Or run this to add it automatically:"
		echo
		echo "  echo '$PATH_LINE' >> $SHELL_RC"
	else
		echo
		echo "(Couldn't auto-detect your shell rc file. Add it to whatever"
		echo " startup file your shell uses.)"
	fi
else
	success "$BIN_DIR is already in PATH"
fi

# ---------------------------------------------------------------------------
# Step 8: Optional model configuration
# ---------------------------------------------------------------------------

# Check if any model config exists
CONFIG_FILE="$HOME/.ai/agent/models.json"
if [ ! -f "$CONFIG_FILE" ]; then
	echo
	info "Model configuration"
	echo
	echo "  ai reads model configuration from: $CONFIG_FILE"
	echo "  No file found yet. To configure a model, create this file with:"
	echo
	echo "  {"
	echo "    \"providers\": {"
	echo "      \"ollama\": {"
	echo "        \"baseUrl\": \"http://localhost:11434/v1\","
	echo "        \"api\": \"openai-completions\","
	echo "        \"apiKey\": \"ollama\","
	echo "        \"models\": ["
	echo "          { \"id\": \"llama3:latest\" }"
	echo "        ]"
	echo "      }"
	echo "    }"
	echo "  }"
	echo
	echo "  See https://github.com/simpletoolsindiaorg/ai for provider examples."
fi

# ---------------------------------------------------------------------------
# Step 9: Verify
# ---------------------------------------------------------------------------

echo
info "Verifying installation"

if [ "$DRY_RUN" -eq 1 ]; then
	echo "  [dry-run] would verify by running 'ai --version'"
else
	if command -v ai >/dev/null 2>&1; then
		AI_VERSION="$(ai --version 2>&1 || true)"
		success "ai is on PATH: $AI_VERSION"
	else
		# Binary not on PATH; can still be invoked directly
		if [ -x "$BIN_DIR/ai" ]; then
			success "ai installed at $BIN_DIR/ai (not on PATH; see hint above)"
		else
			warn "Could not find ai in PATH or at $BIN_DIR/ai"
		fi
	fi
fi

echo
info "Done!"
echo
echo "  Try:    ai --help"
echo "  Update: $REPO_URL"
echo "  Docs:   AGENTS.md, README.md, NOTICE.md"
echo
echo "  Quick test:  ai -p 'echo hi'"
echo
