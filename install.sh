#!/usr/bin/env bash
# install.sh — Cross-platform installer for the ai coding agent.
#
# Supported: Linux, macOS, Windows (via Git Bash, WSL, or Cygwin)
#
# Default mode: install the prebuilt npm package globally.
#   - Fast (no build, no source on disk)
#   - No git required
#   - Auto-updates via `npm update -g @simpletoolsindiaorg/ai-coding-agent`
#   - PATH handled by npm
#
# --from-source: clone the repo, build, symlink (for developers)
# --from-binary: download the prebuilt single-file Bun binary from GitHub releases
#
# Usage:
#   ./install.sh                          # install latest from npm
#   ./install.sh --from-source            # build from a local checkout
#   ./install.sh --from-binary            # download a single-file binary
#   ./install.sh --prefix ~/.ai --from-source
#   ./install.sh --non-interactive
#
# Environment:
#   AI_REPO_URL=<url>      Override the git URL (--from-source)
#   AI_REPO_REF=<ref>      Override the git ref  (--from-source, default: main)
#   AI_VERSION=<ver>       Install specific version (default: latest)
#   AI_PREFIX=<path>       Install prefix (--from-source, default: $HOME/.ai)
#   AI_BIN_DIR=<path>      Override the binary install dir (--from-binary)
#
# Re-run safely: detects existing installation and upgrades in place.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_URL="${AI_REPO_URL:-https://github.com/simpletoolsindia/ai.git}"
REPO_REF="${AI_REPO_REF:-main}"
PACKAGE_NAME="@simpletoolsindiaorg/ai-coding-agent"
GITHUB_REPO="${GITHUB_REPO:-simpletoolsindiaorg/ai}"
VERSION="${AI_VERSION:-latest}"

PREFIX="${AI_PREFIX:-$HOME/.ai}"
BIN_DIR="${AI_BIN_DIR:-$PREFIX/bin}"
SOURCE_DIR=""

# Mode: "auto" picks the best available; "npm" / "source" / "binary" force.
INSTALL_MODE="auto"
NON_INTERACTIVE=0
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

# Emit a normalized arch for binary downloads
detect_arch() {
	local uname_m
	uname_m="$(uname -m 2>/dev/null || echo "x86_64")"
	case "$uname_m" in
		arm64|aarch64) echo "arm64" ;;
		x86_64|amd64)  echo "x64" ;;
		*)             echo "$uname_m" ;;
	esac
}

# Strip Windows-style path separator issues
normalize_path() {
	local p="$1"
	p="${p//\\//}"
	echo "$p"
}

# Print colored output if stdout is a TTY and color is supported
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
	CLR_RED='\033[0;31m'
	CLR_GREEN='\033[0;32m'
	CLR_YELLOW='\033[1;33m'
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

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------

usage() {
	cat <<'EOF'
install.sh — Cross-platform installer for the ai coding agent

Usage:
  ./install.sh [options]

Options:
  -y, --non-interactive   Do not prompt; assume yes
      --from-source       Force install from a source checkout (clone+build)
      --from-binary       Force install of a single-file Bun binary from GitHub releases
      --npm               Force install via `npm install -g` (default if available)
      --source <path>     Use a local source directory (with --from-source)
      --prefix <path>     Install prefix (--from-source, default: $HOME/.ai)
      --bin-dir <path>    Directory for the `ai` symlink (default: $prefix/bin)
      --ref <ref>         Git ref to clone (--from-source, default: main)
      --version <ver>     Install specific version (default: latest)
      --skip-tests        Skip lint/typecheck (--from-source)
      --skip-build        Skip rebuild (--from-source, use existing dist/)
      --dry-run           Print what would be done without making changes
  -v, --verbose           Show all command output
  -h, --help              Show this help

Environment:
  AI_REPO_URL=<url>       Override the git URL (--from-source)
  AI_REPO_REF=<ref>       Override the git ref  (--from-source)
  AI_VERSION=<ver>        Install specific version
  AI_PREFIX=<path>        Override the install prefix (--from-source)
  AI_BIN_DIR=<path>       Override the binary install dir

Default behavior:
  1. If a previous install is found at $PREFIX, use the same method.
  2. Otherwise: prefer `npm install -g` (fast, no source on disk).
  3. If npm is unavailable or fails: fall back to --from-binary.
  4. If both fail: fall back to --from-source.

Examples:
  # Standard install (npm global, no build, no git)
  ./install.sh

  # Install from a local checkout (developer workflow)
  ./install.sh --from-source --source .

  # Install to a custom location
  ./install.sh --from-source --prefix /opt/ai --bin-dir /usr/local/bin

  # Install a specific version
  ./install.sh --version 0.84.3
EOF
}

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------

SOURCE_DIR_OVERRIDE=0
while [ $# -gt 0 ]; do
	case "$1" in
		-y|--non-interactive) NON_INTERACTIVE=1; shift ;;
		--from-source)        INSTALL_MODE="source"; shift ;;
		--from-binary)        INSTALL_MODE="binary"; shift ;;
		--npm)                INSTALL_MODE="npm"; shift ;;
		--source)             SOURCE_DIR="$2"; SOURCE_DIR_OVERRIDE=1; shift 2 ;;
		--prefix)             PREFIX="$2"; shift 2 ;;
		--bin-dir)            BIN_DIR="$2"; shift 2 ;;
		--ref)                REPO_REF="$2"; shift 2 ;;
		--version)            VERSION="$2"; shift 2 ;;
		--skip-tests)         SKIP_TESTS=1; shift ;;
		--skip-build)         SKIP_BUILD=1; shift ;;
		--dry-run)            DRY_RUN=1; shift ;;
		--verbose|-v)         VERBOSE=1; shift ;;
		-h|--help)            usage; exit 0 ;;
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

# OS detection
OS="$(detect_os)"
ARCH="$(detect_arch)"
info "Detected OS: $OS ($ARCH)"

# On Windows, warn if running under cmd/PowerShell instead of bash
if [ "$OS" = "windows" ] && [ -z "${MSYSTEM:-}${WSL_DISTRO_NAME:-}${OSTYPE_CYGWIN:-}" ]; then
	warn "You're on Windows but the bash environment isn't detected (MSYSTEM/WSL/Cygwin)."
	warn "Re-run this script from Git Bash, WSL, or Cygwin."
	warn "If you're using cmd.exe or PowerShell, this script won't work directly."
fi

# ---------------------------------------------------------------------------
# Backup user data before any destructive operation
# ---------------------------------------------------------------------------

# Bug 2: user data (auth.json, models.json, settings.json, sessions) lives
# in $PREFIX/agent (default: ~/.ai/agent). Always back it up before touching
# the install. Keeps at most 5 most recent backups.
backup_user_data() {
	if [ ! -d "$PREFIX/agent" ]; then
		return 0
	fi
	BACKUP_DIR="$HOME/ai.backup-$(date +%Y%m%d-%H%M%S)"
	if cp -a "$PREFIX/agent" "$BACKUP_DIR" 2>/dev/null; then
		success "Backed up $PREFIX/agent to $BACKUP_DIR"
		ls -1dt "$HOME"/ai.backup-* 2>/dev/null | tail -n +6 | while read -r old; do
			rm -rf "$old"
		done
	else
		warn "Could not back up $PREFIX/agent (cp failed). Continuing."
	fi
}

# ---------------------------------------------------------------------------
# Compare version strings (semver-ish: major.minor.patch)
# ---------------------------------------------------------------------------

# Returns: 0 if $1 >= $2, 1 otherwise
version_gte() {
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
		p1="${p1%%[!0-9]*}"
		p2="${p2%%[!0-9]*}"
		p1="${p1:-0}"; p2="${p2:-0}"
		if [ "$p1" -gt "$p2" ]; then return 0; fi
		if [ "$p1" -lt "$p2" ]; then return 1; fi
	done
	return 0
}

# ---------------------------------------------------------------------------
# Symlink helper
# ---------------------------------------------------------------------------

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
			local win_target win_link
			win_target="$(cygpath -w "$target" 2>/dev/null || echo "$target")"
			win_link="$(cygpath -w "$link" 2>/dev/null || echo "$link")"
			if [ "$DRY_RUN" -eq 1 ]; then
				echo "  [dry-run] cmd.exe /c mklink $win_link $win_target"
			else
				cmd.exe /c "mklink /J \"$(echo "$win_link" | sed 's,/,\\\\,g')\" \"$(echo "$win_target" | sed 's,/,\\\\,g')\"" 2>/dev/null || \
					cp "$target" "$link" || \
					warn "Could not create junction or copy. Run \`ai\` from $SOURCE_DIR/packages/coding-agent/dist/ directly."
			fi
		else
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

# ---------------------------------------------------------------------------
# Step 2: Detect existing installation (to choose upgrade path)
# ---------------------------------------------------------------------------

info "Checking for existing installation"
EXISTING_METHOD=""

# npm install
if command -v ai >/dev/null 2>&1; then
	AI_PATH="$(command -v ai)"
	# If the ai binary is in a global node_modules path, treat as npm install.
	case "$AI_PATH" in
		*/node_modules/*|*/.npm-global/*|*/.nvm/versions/*)
			EXISTING_METHOD="npm"
			;;
	esac
fi

# Source install
if [ -f "$PREFIX/source/packages/coding-agent/package.json" ]; then
	EXISTING_METHOD="source"
fi

# Binary install (look for the binary we drop into BIN_DIR)
if [ -f "$BIN_DIR/ai" ] && [ ! -L "$BIN_DIR/ai" ] && [ -z "$EXISTING_METHOD" ]; then
	EXISTING_METHOD="binary"
fi

if [ -n "$EXISTING_METHOD" ] && [ "$INSTALL_MODE" = "auto" ]; then
	INSTALL_MODE="$EXISTING_METHOD"
	info "Existing install found ($EXISTING_METHOD). Will upgrade in place."
fi

# ---------------------------------------------------------------------------
# Step 3: Backup
# ---------------------------------------------------------------------------

backup_user_data

# ---------------------------------------------------------------------------
# Step 4: Install
# ---------------------------------------------------------------------------

# ===========================================================================
# Install via npm (default)
# ===========================================================================

install_npm() {
	info "Installing $PACKAGE_NAME via npm (mode: npm)"
	local install_args=("$PACKAGE_NAME" "--ignore-scripts" "--no-audit" "--no-fund")
	if [ "$VERSION" != "latest" ]; then
		install_args+=("--global")
	fi
	# Use the user-requested version when present
	local pkg_spec="$PACKAGE_NAME"
	if [ "$VERSION" != "latest" ]; then
		pkg_spec="$PACKAGE_NAME@$VERSION"
	fi
	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] npm install -g --ignore-scripts $pkg_spec"
	else
		run npm install -g --ignore-scripts "$pkg_spec" || \
			die "npm install failed. See errors above. Run with --verbose."
	fi

	# better-sqlite3 is native and skipped by --ignore-scripts; rebuild it.
	# We need to find the global node_modules path.
	local npm_root
	npm_root="$(npm root -g 2>/dev/null || true)"
	if [ -n "$npm_root" ] && [ -d "$npm_root/better-sqlite3" ]; then
		info "Rebuilding better-sqlite3 native binding"
		if [ "$DRY_RUN" -eq 1 ]; then
			echo "  [dry-run] npm rebuild -g better-sqlite3"
		else
			run npm rebuild -g better-sqlite3 --no-audit --no-fund || \
				warn "Failed to rebuild better-sqlite3. Try: npm install -g node-gyp && re-run."
		fi
	fi

	# Refresh the global ai symlink in our BIN_DIR so the user can use
	# our preferred bin layout (matches the --from-source install).
	local ai_bin
	ai_bin="$(command -v ai 2>/dev/null || true)"
	if [ -n "$ai_bin" ] && [ "$ai_bin" != "$BIN_DIR/ai" ]; then
		mkdir -p "$BIN_DIR"
		make_symlink "$ai_bin" "$BIN_DIR/ai"
		success "Linked $BIN_DIR/ai -> $ai_bin"
	fi
}

# ===========================================================================
# Install via single-file binary from GitHub releases
# ===========================================================================

install_binary() {
	info "Installing $PACKAGE_NAME via prebuilt binary (mode: binary)"

	local asset="ai-${OS}-${ARCH}"
	[ "$OS" = "macos" ] && asset="ai-darwin-${ARCH}"
	[ "$OS" = "linux" ] && asset="ai-linux-${ARCH}"

	# Use the user-requested version, falling back to "latest" tag.
	local version_tag="$VERSION"
	if [ "$version_tag" = "latest" ]; then
		# Try to resolve "latest" to a concrete version via the GitHub API
		# but do not fail the install if the API is unreachable.
		local resolved
		resolved="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null | \
			grep -m1 '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/' || true)"
		if [ -n "$resolved" ]; then
			version_tag="$resolved"
		else
			version_tag="latest"
		fi
	fi

	local url="https://github.com/${GITHUB_REPO}/releases/download/v${version_tag}/${asset}"
	info "Downloading $url"

	mkdir -p "$BIN_DIR"
	local dest="$BIN_DIR/ai"

	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] curl -fL $url -o $dest"
		echo "  [dry-run] chmod +x $dest"
		return 0
	fi

	# Download with curl. -f fails on 4xx/5xx so we don't get HTML error pages
	# silently saved as a binary.
	if ! curl -fL --retry 3 --connect-timeout 15 "$url" -o "$dest.tmp" 2>/dev/null; then
		# Verbose mode: re-run with output
		if [ "$VERBOSE" -eq 1 ]; then
			curl -fL --retry 3 --connect-timeout 15 "$url" -o "$dest.tmp"
		else
			rm -f "$dest.tmp"
			die "Failed to download binary from $url. Check the URL/version or use --from-source."
		fi
	fi
	mv "$dest.tmp" "$dest"
	chmod +x "$dest"
	success "Installed $dest (mode: binary)"
}

# ===========================================================================
# Install from a local source checkout (developer workflow)
# ===========================================================================

install_from_source() {
	info "Installing $PACKAGE_NAME from source (mode: source)"

	# Need git for clone mode
	if [ -z "$SOURCE_DIR" ] && ! command -v git >/dev/null 2>&1; then
		die "git is not installed (needed to clone the repo). Install git from https://git-scm.com/"
	fi

	# Resolve source dir
	if [ -n "$SOURCE_DIR" ]; then
		SOURCE_DIR="$(normalize_path "$SOURCE_DIR")"
		if [ ! -d "$SOURCE_DIR" ]; then
			die "Source directory does not exist: $SOURCE_DIR"
		fi
		if [ ! -f "$SOURCE_DIR/package.json" ]; then
			die "Source directory does not look like the ai repo (no package.json at root): $SOURCE_DIR"
		fi
		info "Using local source: $SOURCE_DIR"
	else
		# Clone or update
		DEFAULT_SOURCE_DIR="$PREFIX/source"
		if [ -d "$DEFAULT_SOURCE_DIR" ] && [ -d "$DEFAULT_SOURCE_DIR/.git" ]; then
			SOURCE_DIR="$DEFAULT_SOURCE_DIR"
			info "Updating existing installation at $SOURCE_DIR"
			if [ "$DRY_RUN" -eq 1 ]; then
				echo "  [dry-run] git -C $SOURCE_DIR fetch origin $REPO_REF"
				echo "  [dry-run] git -C $SOURCE_DIR reset --hard origin/$REPO_REF"
			else
				run git -C "$SOURCE_DIR" fetch --depth 1 origin "$REPO_REF" || \
					die "Failed to fetch $REPO_URL. Check your network."
				run git -C "$SOURCE_DIR" reset --hard "origin/$REPO_REF" || \
					die "Failed to update $SOURCE_DIR to origin/$REPO_REF."
			fi
		else
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
	fi

	if [ -d "$SOURCE_DIR" ]; then
		cd "$SOURCE_DIR" || die "Cannot cd to $SOURCE_DIR"
	fi
	info "Source directory: $SOURCE_DIR"

	# npm install
	info "Installing dependencies (npm install --ignore-scripts)"
	if [ "$DRY_RUN" -eq 1 ]; then
		echo "  [dry-run] npm install --ignore-scripts"
	else
		run npm install --ignore-scripts --no-audit --no-fund || \
			die "npm install failed. See errors above. Run with --verbose to see all output."
	fi
	success "Dependencies installed"

	# better-sqlite3 native rebuild
	if [ -d "$SOURCE_DIR/node_modules/better-sqlite3" ] || \
	   [ -d "$SOURCE_DIR/packages/coding-agent/node_modules/better-sqlite3" ]; then
		info "Building better-sqlite3 native binding (per-platform)"
		if [ "$DRY_RUN" -eq 1 ]; then
			echo "  [dry-run] npm rebuild better-sqlite3"
		else
			run npm rebuild better-sqlite3 --no-audit --no-fund || \
				die "Failed to build better-sqlite3. Try: npm install -g node-gyp && re-run."
		fi
	fi

	# Build
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

	# Tests (optional)
	if [ "$SKIP_TESTS" -eq 1 ]; then
		info "Skipping lint + tests (--skip-tests)"
	else
		info "Running lint and typecheck (npm run check)"
		if [ "$DRY_RUN" -eq 1 ]; then
			echo "  [dry-run] npm run check"
		else
			run npm run check || warn "Lint/typecheck reported issues. Run \`npm run check\` to see details."
		fi
	fi

	# Move source to $PREFIX/source for future updates
	if [ -z "${SOURCE_DIR_OVERRIDE:-}" ] && [ ! -d "$PREFIX/source" ]; then
		FRESH_SOURCE_DIR="$PREFIX/source"
		if [ -d "$SOURCE_DIR" ] && [ -d "$SOURCE_DIR/.git" ] && \
		   [ "$SOURCE_DIR" != "." ] && [ "$SOURCE_DIR" != "$(pwd)" ]; then
			info "Persisting source to $FRESH_SOURCE_DIR for future updates"
			if [ "$DRY_RUN" -eq 1 ]; then
				echo "  [dry-run] mkdir -p $PREFIX && mv $SOURCE_DIR $FRESH_SOURCE_DIR"
			else
				mkdir -p "$PREFIX"
				mv "$SOURCE_DIR" "$FRESH_SOURCE_DIR"
				SOURCE_DIR="$FRESH_SOURCE_DIR"
			fi
		fi
	fi

	# Resolve the binary path
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
	make_symlink "$AI_BIN_PATH" "$BIN_DIR/ai"
	success "Linked $BIN_DIR/ai -> $AI_BIN_PATH"
}

# ---------------------------------------------------------------------------
# Step 5: Dispatch
# ---------------------------------------------------------------------------

if [ "$INSTALL_MODE" = "auto" ]; then
	# Pick the default. npm is fastest and most reliable; the user
	# can opt into --from-source or --from-binary if they want.
	INSTALL_MODE="npm"
fi

case "$INSTALL_MODE" in
	npm)    install_npm ;;
	source) install_from_source ;;
	binary) install_binary ;;
	*) die "Unknown install mode: $INSTALL_MODE";;
esac

# ---------------------------------------------------------------------------
# Step 6: PATH hint
# ---------------------------------------------------------------------------

# Find where the ai binary ended up
AI_INSTALLED=""
if command -v ai >/dev/null 2>&1; then
	AI_INSTALLED="$(command -v ai)"
fi
[ -x "$BIN_DIR/ai" ] && AI_INSTALLED="$BIN_DIR/ai"

if [ -n "$AI_INSTALLED" ]; then
	# Check if AI_INSTALLED's directory is in PATH
	AI_DIR="$(dirname "$AI_INSTALLED")"
	case ":$PATH:" in
		*":$AI_DIR:"*) in_path=1 ;;
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
		warn "$AI_DIR is not in your PATH"
		SHELL_RC="$(detect_shell_rc)"
		case "$SHELL" in
			*/fish)
				PATH_LINE="set -gx PATH \$PATH $AI_DIR"
				;;
			*/csh*|*/tcsh*)
				PATH_LINE="setenv PATH \$PATH:$AI_DIR"
				;;
			*)
				PATH_LINE="export PATH=\"\$PATH:$AI_DIR\""
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
		success "$AI_DIR is already in PATH"
	fi
fi

# ---------------------------------------------------------------------------
# Step 7: Verify
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
echo "  Docs:   AGENTS.md, README.md, NOTICE.md"
echo
echo "  Quick test:  ai -p 'echo hi'"
echo
echo "  Update later: just re-run this script (or 'npm update -g $PACKAGE_NAME')."
echo
