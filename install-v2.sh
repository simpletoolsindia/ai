#!/usr/bin/env bash
# ============================================================================
# ai Installer v2.0
# Modern, user-friendly installation experience
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly INSTALLER_VERSION="2.0.0"
readonly REPO_URL="https://github.com/simpletoolsindiaorg/ai"
readonly NPM_PACKAGE="@simpletoolsindiaorg/ai-coding-agent"
readonly BIN_NAME="ai"
readonly CONFIG_DIR="$HOME/.ai"
readonly BIN_DIR="$CONFIG_DIR/bin"
readonly BACKUP_DIR="$HOME"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

# ============================================================================
# Utility Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

log_header() {
    echo ""
    echo -e "${BOLD}$1${NC}"
    echo "$(printf '=%.0s' {1..60})"
}

# ============================================================================
# Platform Detection
# ============================================================================

detect_platform() {
    local os arch

    # Detect OS
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        CYGWIN*|MINGW*|MSYS*) os="windows" ;;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    # Detect architecture
    case "$(uname -m)" in
        x86_64|amd64)   arch="x64" ;;
        aarch64|arm64)   arch="arm64" ;;
        armv7l|armhf)    arch="arm" ;;
        *)
            log_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    echo "${os}-${arch}"
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

check_prerequisites() {
    log_step "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed."
        echo ""
        echo "Please install Node.js 22+ from:"
        echo "  https://nodejs.org/"
        echo ""
        echo "Or use a version manager:"
        echo "  nvm: https://github.com/nvm-sh/nvm"
        echo "  fnm: https://github.com/Schniz/fnm"
        echo "  mise: https://mise.jdx.dev/"
        exit 1
    fi

    local node_version
    node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt 22 ]; then
        log_error "Node.js 22+ is required (found: $(node -v))."
        echo ""
        echo "Please upgrade Node.js:"
        echo "  nvm install 22"
        echo "  fnm use 22"
        echo "  mise use node@22"
        exit 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed."
        echo ""
        echo "npm usually comes with Node.js. Please reinstall Node.js."
        exit 1
    fi

    local npm_version
    npm_version=$(npm -v | cut -d. -f1)
    if [ "$npm_version" -lt 10 ]; then
        log_error "npm 10+ is required (found: $(npm -v))."
        echo ""
        echo "Please upgrade npm:"
        echo "  npm install -g npm@latest"
        exit 1
    fi

    log_success "Prerequisites satisfied (Node.js $(node -v), npm $(npm -v))"
}

# ============================================================================
# Backup Functions
# ============================================================================

backup_existing_installation() {
    if [ -d "$CONFIG_DIR/agent" ]; then
        local backup_name="ai-backup-$(date +%Y%m%d-%H%M%S)"
        local backup_path="$BACKUP_DIR/$backup_name"

        log_step "Backing up existing configuration..."
        cp -r "$CONFIG_DIR/agent" "$backup_path"

        # Keep only 5 most recent backups
        local backup_count
        backup_count=$(ls -d "$BACKUP_DIR"/ai-backup-* 2>/dev/null | wc -l)
        if [ "$backup_count" -gt 5 ]; then
            ls -d "$BACKUP_DIR"/ai-backup-* | head -n "$((backup_count - 5))" | xargs rm -rf
        fi

        log_success "Backup created: $backup_path"
    fi
}

# ============================================================================
# Installation Methods
# ============================================================================

install_via_npm() {
    log_step "Installing via npm..."

    # Create bin directory
    mkdir -p "$BIN_DIR"

    # Install package
    log_info "Downloading and installing $NPM_PACKAGE..."
    if ! npm install -g "$NPM_PACKAGE" --ignore-scripts 2>&1; then
        log_error "Failed to install npm package."
        return 1
    fi

    # Rebuild native dependencies
    log_info "Rebuilding native dependencies..."
    if ! npm rebuild -g better-sqlite3 2>&1; then
        log_warn "Failed to rebuild better-sqlite3 (non-critical)."
    fi

    # Create symlink
    local npm_bin
    npm_bin=$(npm bin -g 2>/dev/null)/$BIN_NAME
    if [ -f "$npm_bin" ]; then
        ln -sf "$npm_bin" "$BIN_DIR/$BIN_NAME"
        log_success "Created symlink: $BIN_DIR/$BIN_NAME"
    else
        log_warn "npm binary not found, skipping symlink creation."
    fi

    return 0
}

install_via_binary() {
    log_step "Installing prebuilt binary..."

    local platform
    platform=$(detect_platform)

    # Get latest version
    local version
    version=$(curl -sL "https://api.github.com/repos/simpletoolsindiaorg/ai/releases/latest" | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/')

    if [ -z "$version" ]; then
        log_error "Failed to fetch latest version."
        return 1
    fi

    local binary_name="ai-${platform}"
    if [[ "$platform" == *"windows"* ]]; then
        binary_name="${binary_name}.exe"
    fi

    local download_url="${REPO_URL}/releases/download/v${version}/${binary_name}"
    local checksum_url="${download_url}.sha256"

    log_info "Downloading ai v${version} for ${platform}..."

    # Create temporary directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT

    # Download binary
    if ! curl -sL "$download_url" -o "$tmp_dir/$binary_name"; then
        log_error "Failed to download binary."
        return 1
    fi

    # Download and verify checksum
    if curl -sL "$checksum_url" -o "$tmp_dir/checksum.sha256" 2>/dev/null; then
        log_info "Verifying checksum..."
        if ! (cd "$tmp_dir" && shasum -a 256 -c checksum.sha256 2>/dev/null); then
            log_error "Checksum verification failed!"
            return 1
        fi
        log_success "Checksum verified."
    else
        log_warn "Checksum file not available, skipping verification."
    fi

    # Install binary
    mkdir -p "$BIN_DIR"
    mv "$tmp_dir/$binary_name" "$BIN_DIR/$BIN_NAME"
    chmod +x "$BIN_DIR/$BIN_NAME"

    log_success "Binary installed to $BIN_DIR/$BIN_NAME"

    return 0
}

install_via_source() {
    log_step "Building from source..."

    local source_dir="$CONFIG_DIR/source"

    # Clone or update repository
    if [ -d "$source_dir/.git" ]; then
        log_info "Updating existing source..."
        cd "$source_dir"
        git fetch origin
        git reset --hard origin/main
    else
        log_info "Cloning repository..."
        rm -rf "$source_dir"
        git clone --depth 1 "$REPO_URL" "$source_dir"
        cd "$source_dir"
    fi

    # Install dependencies
    log_info "Installing dependencies..."
    if ! npm install --ignore-scripts 2>&1; then
        log_error "Failed to install dependencies."
        return 1
    fi

    # Rebuild native dependencies
    log_info "Rebuilding native dependencies..."
    if ! npm rebuild better-sqlite3 2>&1; then
        log_warn "Failed to rebuild better-sqlite3 (non-critical)."
    fi

    # Build project
    log_info "Building project..."
    if ! npm run build 2>&1; then
        log_error "Build failed."
        return 1
    fi

    # Create symlink
    mkdir -p "$BIN_DIR"
    ln -sf "$source_dir/packages/coding-agent/dist/cli.js" "$BIN_DIR/$BIN_NAME"

    log_success "Source build installed to $BIN_DIR/$BIN_NAME"

    return 0
}

# ============================================================================
# PATH Configuration
# ============================================================================

configure_path() {
    log_step "Configuring PATH..."

    local shell_config
    local shell_name
    shell_name=$(basename "$SHELL")

    case "$shell_name" in
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                shell_config="$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                shell_config="$HOME/.bash_profile"
            else
                shell_config="$HOME/.profile"
            fi
            ;;
        zsh)
            shell_config="$HOME/.zshrc"
            ;;
        fish)
            shell_config="$HOME/.config/fish/config.fish"
            ;;
        *)
            shell_config="$HOME/.profile"
            ;;
    esac

    # Check if PATH already contains bin directory
    if echo "$PATH" | grep -q "$BIN_DIR"; then
        log_success "PATH already configured."
        return 0
    fi

    # Add to PATH
    local path_line="export PATH=\"\$HOME/.ai/bin:\$PATH\""

    if [ "$shell_name" = "fish" ]; then
        path_line="set -gx PATH \$HOME/.ai/bin \$PATH"
    fi

    if ! grep -q "$BIN_DIR" "$shell_config" 2>/dev/null; then
        echo "" >> "$shell_config"
        echo "# ai CLI" >> "$shell_config"
        echo "$path_line" >> "$shell_config"
        log_success "Added $BIN_DIR to PATH in $shell_config"
    fi

    # Update current session
    export PATH="$BIN_DIR:$PATH"

    return 0
}

# ============================================================================
# Installation Verification
# ============================================================================

verify_installation() {
    log_step "Verifying installation..."

    # Check if binary exists
    if [ ! -f "$BIN_DIR/$BIN_NAME" ]; then
        log_error "Binary not found at $BIN_DIR/$BIN_NAME"
        return 1
    fi

    # Check if binary is executable
    if [ ! -x "$BIN_DIR/$BIN_NAME" ]; then
        log_error "Binary is not executable."
        return 1
    fi

    # Test binary
    local version_output
    if version_output=$("$BIN_DIR/$BIN_NAME" --version 2>&1); then
        log_success "Installation verified: $version_output"
    else
        log_warn "Binary installed but version check failed."
        log_warn "This may be due to missing native dependencies."
    fi

    return 0
}

# ============================================================================
# Post-Installation
# ============================================================================

show_post_install_info() {
    log_header "Installation Complete!"

    echo ""
    echo -e "${GREEN}ai has been installed successfully!${NC}"
    echo ""
    echo "Configuration directory: $CONFIG_DIR"
    echo "Binary location: $BIN_DIR/$BIN_NAME"
    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo ""
    echo "  1. Start ai:"
    echo "     $ ai"
    echo ""
    echo "  2. Authenticate with a provider:"
    echo "     $ ai"
    echo "     /login"
    echo ""
    echo "  3. Set your API key:"
    echo "     export ANTHROPIC_API_KEY=your-key"
    echo "     export OPENAI_API_KEY=your-key"
    echo ""
    echo -e "${BOLD}Useful Commands:${NC}"
    echo ""
    echo "  ai              Start interactive mode"
    echo "  ai -p \"prompt\"  Non-interactive mode"
    echo "  ai --help       Show help"
    echo "  ai --version    Show version"
    echo ""
    echo -e "${BOLD}Documentation:${NC}"
    echo ""
    echo "  $REPO_URL"
    echo ""
    echo -e "${BOLD}To uninstall:${NC}"
    echo ""
    echo "  curl -fsSL $REPO_URL/raw/main/uninstall.sh | bash"
    echo ""

    # Source shell config if needed
    if [ -n "${ZSH_VERSION:-}" ]; then
        echo -e "${YELLOW}Note: Run 'source ~/.zshrc' to update your current shell.${NC}"
    elif [ -n "${BASH_VERSION:-}" ]; then
        echo -e "${YELLOW}Note: Run 'source ~/.bashrc' to update your current shell.${NC}"
    fi
}

# ============================================================================
# Main Installation Flow
# ============================================================================

main() {
    local install_method="${1:-auto}"

    log_header "ai Installer v${INSTALLER_VERSION}"

    echo ""
    echo "This installer will install ai, a terminal-based AI coding agent."
    echo ""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --npm)
                install_method="npm"
                shift
                ;;
            --binary)
                install_method="binary"
                shift
                ;;
            --source)
                install_method="source"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --npm      Install via npm (default)"
                echo "  --binary   Install prebuilt binary"
                echo "  --source   Build from source"
                echo "  --help     Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Check prerequisites
    check_prerequisites

    # Backup existing installation
    backup_existing_installation

    # Install based on method
    case "$install_method" in
        npm)
            install_via_npm
            ;;
        binary)
            install_via_binary
            ;;
        source)
            install_via_source
            ;;
        auto)
            # Try npm first, then binary, then source
            if ! install_via_npm; then
                log_warn "npm installation failed, trying binary..."
                if ! install_via_binary; then
                    log_warn "Binary installation failed, trying source..."
                    if ! install_via_source; then
                        log_error "All installation methods failed."
                        exit 1
                    fi
                fi
            fi
            ;;
    esac

    # Configure PATH
    configure_path

    # Verify installation
    verify_installation

    # Show post-install info
    show_post_install_info
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
