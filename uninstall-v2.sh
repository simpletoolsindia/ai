#!/usr/bin/env bash
# ============================================================================
# ai Uninstaller v2.0
# Safe and user-friendly uninstallation
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly UNINSTALLER_VERSION="2.0.0"
readonly CONFIG_DIR="$HOME/.ai"
readonly BIN_DIR="$CONFIG_DIR/bin"
readonly BIN_NAME="ai"
readonly NPM_PACKAGE="@simpletoolsindiaorg/ai-coding-agent"

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
# Confirmation
# ============================================================================

confirm_uninstall() {
    local purge_mode="$1"

    echo ""
    echo -e "${YELLOW}This will uninstall ai from your system.${NC}"
    echo ""

    if [ "$purge_mode" = true ]; then
        echo -e "${RED}WARNING: Purge mode will delete ALL data including:${NC}"
        echo "  - Configuration (~/.ai/agent/)"
        echo "  - Sessions"
        echo "  - Authentication"
        echo "  - Custom models"
        echo "  - Extensions"
        echo ""
    else
        echo "The following will be removed:"
        echo "  - ai binary"
        echo "  - Source code (if built from source)"
        echo "  - npm package"
        echo ""
        echo "The following will be PRESERVED:"
        echo "  - Configuration (~/.ai/agent/)"
        echo "  - Sessions"
        echo "  - Authentication"
        echo "  - Custom models"
        echo ""
    fi

    read -p "Continue? (y/N) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstall cancelled."
        exit 0
    fi
}

# ============================================================================
# Backup
# ============================================================================

backup_user_data() {
    log_step "Creating backup..."

    if [ -d "$CONFIG_DIR/agent" ]; then
        local backup_name="ai-backup-pre-uninstall-$(date +%Y%m%d-%H%M%S)"
        local backup_path="$HOME/$backup_name"

        cp -r "$CONFIG_DIR/agent" "$backup_path"
        log_success "Backup created: $backup_path"
    else
        log_info "No user data to backup."
    fi
}

# ============================================================================
# Removal Functions
# ============================================================================

remove_binary() {
    log_step "Removing binary..."

    # Remove from bin directory
    if [ -f "$BIN_DIR/$BIN_NAME" ]; then
        rm -f "$BIN_DIR/$BIN_NAME"
        log_success "Removed $BIN_DIR/$BIN_NAME"
    fi

    # Remove common symlink locations
    local symlink_locations=(
        "/opt/homebrew/bin/$BIN_NAME"
        "/usr/local/bin/$BIN_NAME"
        "$HOME/.local/bin/$BIN_NAME"
    )

    for location in "${symlink_locations[@]}"; do
        if [ -L "$location" ]; then
            rm -f "$location"
            log_success "Removed symlink: $location"
        fi
    done
}

remove_npm_package() {
    log_step "Removing npm package..."

    if npm list -g "$NPM_PACKAGE" &>/dev/null; then
        npm uninstall -g "$NPM_PACKAGE" 2>/dev/null || true
        log_success "Removed npm package: $NPM_PACKAGE"
    else
        log_info "npm package not found."
    fi
}

remove_source() {
    log_step "Removing source code..."

    local source_dir="$CONFIG_DIR/source"
    if [ -d "$source_dir" ]; then
        rm -rf "$source_dir"
        log_success "Removed source directory: $source_dir"
    else
        log_info "Source directory not found."
    fi
}

remove_config() {
    log_step "Removing configuration..."

    if [ -d "$CONFIG_DIR" ]; then
        rm -rf "$CONFIG_DIR"
        log_success "Removed configuration directory: $CONFIG_DIR"
    else
        log_info "Configuration directory not found."
    fi
}

remove_user_data() {
    log_step "Removing user data..."

    if [ -d "$CONFIG_DIR/agent" ]; then
        rm -rf "$CONFIG_DIR/agent"
        log_success "Removed user data: $CONFIG_DIR/agent"
    else
        log_info "User data not found."
    fi
}

# ============================================================================
# PATH Cleanup
# ============================================================================

cleanup_path() {
    log_step "Cleaning up PATH..."

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

    if [ -f "$shell_config" ]; then
        # Remove ai PATH entries
        if grep -q "# ai CLI" "$shell_config" 2>/dev/null; then
            sed -i.bak '/# ai CLI/d' "$shell_config"
            sed -i.bak "\|$BIN_DIR|d" "$shell_config"
            rm -f "${shell_config}.bak"
            log_success "Removed PATH entries from $shell_config"
        fi
    fi
}

# ============================================================================
# Verification
# ============================================================================

verify_uninstall() {
    log_step "Verifying uninstallation..."

    local issues=0

    # Check binary
    if [ -f "$BIN_DIR/$BIN_NAME" ]; then
        log_warn "Binary still exists: $BIN_DIR/$BIN_NAME"
        issues=$((issues + 1))
    fi

    # Check npm package
    if npm list -g "$NPM_PACKAGE" &>/dev/null; then
        log_warn "npm package still installed: $NPM_PACKAGE"
        issues=$((issues + 1))
    fi

    # Check config directory
    if [ -d "$CONFIG_DIR" ]; then
        log_info "Configuration directory still exists: $CONFIG_DIR"
    fi

    if [ $issues -eq 0 ]; then
        log_success "Uninstallation verified successfully."
    else
        log_warn "Some components may not have been fully removed."
    fi
}

# ============================================================================
# Post-Uninstall
# ============================================================================

show_post_uninstall_info() {
    log_header "Uninstallation Complete!"

    echo ""
    echo -e "${GREEN}ai has been uninstalled.${NC}"
    echo ""

    if [ -d "$CONFIG_DIR" ]; then
        echo "Configuration directory preserved: $CONFIG_DIR"
        echo ""
        echo "To completely remove all data, run:"
        echo "  $0 --purge"
        echo ""
    fi

    echo "To reinstall ai:"
    echo "  curl -fsSL https://raw.githubusercontent.com/simpletoolsindiaorg/ai/main/install.sh | bash"
    echo ""
    echo "Thank you for using ai!"
}

# ============================================================================
# Main Uninstall Flow
# ============================================================================

main() {
    local purge_mode=false
    local keep_source=false

    log_header "ai Uninstaller v${UNINSTALLER_VERSION}"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --purge)
                purge_mode=true
                shift
                ;;
            --keep-source)
                keep_source=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --purge        Remove all data including configuration"
                echo "  --keep-source  Keep source code (if built from source)"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Confirm uninstall
    confirm_uninstall "$purge_mode"

    # Create backup
    backup_user_data

    # Remove components
    remove_binary
    remove_npm_package

    if [ "$keep_source" = false ]; then
        remove_source
    fi

    # Handle user data
    if [ "$purge_mode" = true ]; then
        remove_config
    else
        remove_user_data
    fi

    # Clean up PATH
    cleanup_path

    # Verify uninstallation
    verify_uninstall

    # Show post-uninstall info
    show_post_uninstall_info
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
