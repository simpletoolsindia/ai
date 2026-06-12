#!/usr/bin/env bash
# ============================================================================
# Universal Installer for ai
# Supports multiple installation methods like other coding assistants
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly INSTALLER_VERSION="3.0.0"
readonly REPO_URL="https://github.com/simpletoolsindiaorg/ai"
readonly NPM_PACKAGE="@simpletoolsindiaorg/ai-coding-agent"
readonly HOMEBREW_TAP="simpletoolsindiaorg/ai"
readonly BINARY_NAME="ai"
readonly CONFIG_DIR="$HOME/.ai"
readonly BIN_DIR="$CONFIG_DIR/bin"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly DIM='\033[2m'
readonly NC='\033[0m'

# ============================================================================
# Utility Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_step() {
    echo -e "${CYAN}→${NC} $1"
}

log_header() {
    echo ""
    echo -e "${BOLD}$1${NC}"
    echo "$(printf '─%.0s' {1..60})"
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
# Installation Methods
# ============================================================================

install_via_homebrew() {
    log_step "Installing via Homebrew..."

    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        log_warn "Homebrew is not installed."
        echo ""
        echo "Install Homebrew first:"
        echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        echo ""
        return 1
    fi

    # Add tap and install
    if brew tap "$HOMEBREW_TAP" 2>/dev/null; then
        log_success "Added tap: $HOMEBREW_TAP"
    fi

    if brew install ai; then
        log_success "Installed via Homebrew"
        return 0
    else
        log_error "Homebrew installation failed"
        return 1
    fi
}

install_via_npm() {
    log_step "Installing via npm..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warn "Node.js is not installed."
        echo ""
        echo "Install Node.js first:"
        echo "  https://nodejs.org/"
        echo ""
        return 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_warn "npm is not installed."
        return 1
    fi

    # Install package
    log_info "Installing $NPM_PACKAGE..."
    if npm install -g "$NPM_PACKAGE" --ignore-scripts 2>&1; then
        # Rebuild native dependencies
        log_info "Rebuilding native dependencies..."
        npm rebuild -g better-sqlite3 2>/dev/null || log_warn "Failed to rebuild better-sqlite3 (non-critical)"

        log_success "Installed via npm"
        return 0
    else
        log_error "npm installation failed"
        return 1
    fi
}

install_via_pip() {
    log_step "Installing via pip..."

    # Check Python
    if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
        log_warn "Python is not installed."
        echo ""
        echo "Install Python first:"
        echo "  https://www.python.org/"
        echo ""
        return 1
    fi

    # Use python3 if available, otherwise python
    local python_cmd="python3"
    if ! command -v python3 &> /dev/null; then
        python_cmd="python"
    fi

    # Install package
    log_info "Installing ai-chat..."
    if "$python_cmd" -m pip install ai-chat 2>&1; then
        log_success "Installed via pip"
        return 0
    else
        log_error "pip installation failed"
        return 1
    fi
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
    local archive_name
    if [[ "$platform" == *"windows"* ]]; then
        archive_name="ai-${platform}.zip"
    else
        archive_name="ai-${platform}.tar.gz"
    fi

    local download_url="${REPO_URL}/releases/download/v${version}/${archive_name}"
    local checksum_url="${REPO_URL}/releases/download/v${version}/${archive_name}.sha256"

    log_info "Downloading ai v${version} for ${platform}..."

    # Create temporary directory
    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT

    # Download archive
    if ! curl -sL "$download_url" -o "$tmp_dir/$archive_name"; then
        log_error "Failed to download archive."
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

    # Extract archive
    log_info "Extracting archive..."
    if [[ "$platform" == *"windows"* ]]; then
        cd "$tmp_dir" && unzip -q "$archive_name"
    else
        cd "$tmp_dir" && tar -xzf "$archive_name"
    fi

    # Install binary
    mkdir -p "$BIN_DIR"
    mv "$tmp_dir/$binary_name" "$BIN_DIR/$BINARY_NAME"
    chmod +x "$BIN_DIR/$BINARY_NAME"

    log_success "Binary installed to $BIN_DIR/$BINARY_NAME"

    return 0
}

install_via_script() {
    log_step "Using official install script..."

    if curl -fsSL "${REPO_URL}/raw/main/install.sh" | bash; then
        log_success "Installed via official script"
        return 0
    else
        log_error "Script installation failed"
        return 1
    fi
}

install_via_source() {
    log_step "Building from source..."

    # Check prerequisites
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required for source build."
        return 1
    fi

    if ! command -v git &> /dev/null; then
        log_error "Git is required for source build."
        return 1
    fi

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
    npm install --ignore-scripts

    # Rebuild native dependencies
    log_info "Rebuilding native dependencies..."
    npm rebuild better-sqlite3 2>/dev/null || log_warn "Failed to rebuild better-sqlite3 (non-critical)"

    # Build project
    log_info "Building project..."
    npm run build

    # Create symlink
    mkdir -p "$BIN_DIR"
    ln -sf "$source_dir/packages/coding-agent/dist/cli.js" "$BIN_DIR/$BINARY_NAME"

    log_success "Source build installed to $BIN_DIR/$BINARY_NAME"

    return 0
}

# ============================================================================
# PATH Configuration
# ============================================================================

configure_path() {
    log_step "Configuring PATH..."

    # Check if PATH already contains bin directory
    if echo "$PATH" | grep -q "$BIN_DIR"; then
        log_success "PATH already configured."
        return 0
    fi

    # Detect shell and add to PATH
    local shell_name
    shell_name=$(basename "$SHELL")

    local shell_config
    local path_line

    case "$shell_name" in
        bash)
            shell_config="$HOME/.bashrc"
            path_line="export PATH=\"\$HOME/.ai/bin:\$PATH\""
            ;;
        zsh)
            shell_config="$HOME/.zshrc"
            path_line="export PATH=\"\$HOME/.ai/bin:\$PATH\""
            ;;
        fish)
            shell_config="$HOME/.config/fish/config.fish"
            path_line="set -gx PATH \$HOME/.ai/bin \$PATH"
            ;;
        *)
            shell_config="$HOME/.profile"
            path_line="export PATH=\"\$HOME/.ai/bin:\$PATH\""
            ;;
    esac

    # Add to PATH
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
    if [ ! -f "$BIN_DIR/$BINARY_NAME" ]; then
        log_error "Binary not found at $BIN_DIR/$BINARY_NAME"
        return 1
    fi

    # Check if binary is executable
    if [ ! -x "$BIN_DIR/$BINARY_NAME" ]; then
        log_error "Binary is not executable."
        return 1
    fi

    # Test binary
    local version_output
    if version_output=$("$BIN_DIR/$BINARY_NAME" --version 2>&1); then
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
    echo "  curl -fsSL ${REPO_URL}/raw/main/uninstall.sh | bash"
    echo ""

    # Source shell config if needed
    if [ -n "${ZSH_VERSION:-}" ]; then
        echo -e "${DIM}Note: Run 'source ~/.zshrc' to update your current shell.${NC}"
    elif [ -n "${BASH_VERSION:-}" ]; then
        echo -e "${DIM}Note: Run 'source ~/.bashrc' to update your current shell.${NC}"
    fi
}

# ============================================================================
# Main Installation Flow
# ============================================================================

main() {
    local install_method="auto"

    log_header "ai Installer v${INSTALLER_VERSION}"

    echo ""
    echo "This installer will install ai, a terminal-based AI coding agent."
    echo ""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --homebrew)
                install_method="homebrew"
                shift
                ;;
            --npm)
                install_method="npm"
                shift
                ;;
            --pip)
                install_method="pip"
                shift
                ;;
            --binary)
                install_method="binary"
                shift
                ;;
            --script)
                install_method="script"
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
                echo "  --homebrew  Install via Homebrew (macOS/Linux)"
                echo "  --npm       Install via npm (requires Node.js)"
                echo "  --pip       Install via pip (requires Python)"
                echo "  --binary    Install prebuilt binary"
                echo "  --script    Use official install script"
                echo "  --source    Build from source"
                echo "  --help      Show this help message"
                echo ""
                echo "If no option is specified, the installer will try methods in this order:"
                echo "  1. Homebrew (if installed)"
                echo "  2. npm (if Node.js installed)"
                echo "  3. pip (if Python installed)"
                echo "  4. Prebuilt binary"
                echo "  5. Source build"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Install based on method
    case "$install_method" in
        homebrew)
            install_via_homebrew
            ;;
        npm)
            install_via_npm
            ;;
        pip)
            install_via_pip
            ;;
        binary)
            install_via_binary
            ;;
        script)
            install_via_script
            ;;
        source)
            install_via_source
            ;;
        auto)
            # Try methods in order of preference
            if command -v brew &> /dev/null; then
                if install_via_homebrew; then
                    configure_path
                    verify_installation
                    show_post_install_info
                    exit 0
                fi
            fi

            if command -v npm &> /dev/null; then
                if install_via_npm; then
                    configure_path
                    verify_installation
                    show_post_install_info
                    exit 0
                fi
            fi

            if command -v python3 &> /dev/null || command -v python &> /dev/null; then
                if install_via_pip; then
                    configure_path
                    verify_installation
                    show_post_install_info
                    exit 0
                fi
            fi

            if install_via_binary; then
                configure_path
                verify_installation
                show_post_install_info
                exit 0
            fi

            if install_via_source; then
                configure_path
                verify_installation
                show_post_install_info
                exit 0
            fi

            log_error "All installation methods failed."
            echo ""
            echo "Please try installing manually:"
            echo "  1. Install Node.js: https://nodejs.org/"
            echo "  2. Run: npm install -g $NPM_PACKAGE"
            exit 1
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
