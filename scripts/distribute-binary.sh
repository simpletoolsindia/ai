#!/usr/bin/env bash
# ============================================================================
# Binary Distribution Script
# Creates platform-specific binary packages for distribution
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT_DIR="$(dirname "$SCRIPT_DIR")"
readonly DIST_DIR="$ROOT_DIR/dist"
readonly RELEASES_DIR="$DIST_DIR/releases"

# Platform matrix
readonly PLATFORMS=(
    "darwin-arm64"
    "darwin-x64"
    "linux-arm64"
    "linux-x64"
    "windows-x64"
)

# ============================================================================
# Utility Functions
# ============================================================================

log_info() {
    echo "[INFO] $1"
}

log_success() {
    echo "[SUCCESS] $1"
}

log_error() {
    echo "[ERROR] $1"
    exit 1
}

# ============================================================================
# Build Binary for Platform
# ============================================================================

build_binary() {
    local platform="$1"
    local os arch binary_name

    # Parse platform
    os=$(echo "$platform" | cut -d- -f1)
    arch=$(echo "$platform" | cut -d- -f2)

    # Set binary name
    if [ "$os" = "windows" ]; then
        binary_name="ai-${platform}.exe"
    else
        binary_name="ai-${platform}"
    fi

    log_info "Building binary for ${platform}..."

    # Build using Bun
    cd "$ROOT_DIR"

    # Install dependencies
    npm ci --ignore-scripts

    # Build packages
    npm run build

    # Create binary
    if [ "$os" = "windows" ]; then
        bun build --compile --target="bun-windows-x64" \
            --outfile="$DIST_DIR/$binary_name" \
            packages/coding-agent/src/cli.ts
    else
        bun build --compile --target="bun-${platform}" \
            --outfile="$DIST_DIR/$binary_name" \
            packages/coding-agent/src/cli.ts
    fi

    # Make executable (Unix)
    if [ "$os" != "windows" ]; then
        chmod +x "$DIST_DIR/$binary_name"
    fi

    log_success "Built binary: $DIST_DIR/$binary_name"
}

# ============================================================================
# Create Archive
# ============================================================================

create_archive() {
    local platform="$1"
    local os arch binary_name archive_name

    # Parse platform
    os=$(echo "$platform" | cut -d- -f1)
    arch=$(echo "$platform" | cut -d- -f2)

    # Set names
    if [ "$os" = "windows" ]; then
        binary_name="ai-${platform}.exe"
        archive_name="ai-${platform}.zip"
    else
        binary_name="ai-${platform}"
        archive_name="ai-${platform}.tar.gz"
    fi

    log_info "Creating archive for ${platform}..."

    cd "$DIST_DIR"

    # Create archive
    if [ "$os" = "windows" ]; then
        zip "$RELEASES_DIR/$archive_name" "$binary_name"
    else
        tar -czf "$RELEASES_DIR/$archive_name" "$binary_name"
    fi

    log_success "Created archive: $RELEASES_DIR/$archive_name"
}

# ============================================================================
# Generate Checksums
# ============================================================================

generate_checksums() {
    log_info "Generating checksums..."

    cd "$RELEASES_DIR"

    # Generate SHA256 checksums
    shasum -a 256 ai-* > checksums.sha256

    # Generate individual checksums
    for file in ai-*; do
        if [ -f "$file" ] && [ "$file" != "checksums.sha256" ]; then
            shasum -a 256 "$file" > "${file}.sha256"
        fi
    done

    log_success "Generated checksums"
}

# ============================================================================
# Create Homebrew Formula
# ============================================================================

create_homebrew_formula() {
    local version="$1"
    local formula_file="$RELEASES_DIR/ai.rb"

    log_info "Creating Homebrew formula..."

    cat > "$formula_file" << EOF
class Ai < Formula
  desc "Terminal-based AI coding agent"
  homepage "https://github.com/simpletoolsindiaorg/ai"
  version "${version}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/simpletoolsindiaorg/ai/releases/download/v${version}/ai-darwin-arm64.tar.gz"
      sha256 "$(cat "$RELEASES_DIR/ai-darwin-arm64.tar.gz.sha256" | cut -d' ' -f1)"
    else
      url "https://github.com/simpletoolsindiaorg/ai/releases/download/v${version}/ai-darwin-x64.tar.gz"
      sha256 "$(cat "$RELEASES_DIR/ai-darwin-x64.tar.gz.sha256" | cut -d' ' -f1)"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/simpletoolsindiaorg/ai/releases/download/v${version}/ai-linux-arm64.tar.gz"
      sha256 "$(cat "$RELEASES_DIR/ai-linux-arm64.tar.gz.sha256" | cut -d' ' -f1)"
    else
      url "https://github.com/simpletoolsindiaorg/ai/releases/download/v${version}/ai-linux-x64.tar.gz"
      sha256 "$(cat "$RELEASES_DIR/ai-linux-x64.tar.gz.sha256" | cut -d' ' -f1)"
    end
  end

  def install
    bin.install "ai-#{OS.kernel_name}-#{Hardware::CPU.arch}" => "ai"
  end

  test do
    system "#{bin}/ai", "--version"
  end
end
EOF

    log_success "Created Homebrew formula: $formula_file"
}

# ============================================================================
# Create WinGet Manifest
# ============================================================================

create_winget_manifest() {
    local version="$1"
    local manifest_dir="$RELEASES_DIR/winget"

    log_info "Creating WinGet manifest..."

    mkdir -p "$manifest_dir"

    # Create version manifest
    cat > "$manifest_dir/version.yaml" << EOF
PackageIdentifier: simpletoolsindiaorg.ai
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.4.0
EOF

    # Create installer manifest
    cat > "$manifest_dir/installer.yaml" << EOF
PackageIdentifier: simpletoolsindiaorg.ai
PackageVersion: ${version}
MinimumOSVersion: 10.0.17763.0
InstallerType: zip
InstallModes:
  - interactive
  - silent
  - silentWithProgress
UpgradeBehavior: install
Installers:
  - Architecture: x64
    InstallerUrl: https://github.com/simpletoolsindiaorg/ai/releases/download/v${version}/ai-windows-x64.zip
    InstallerSha256: $(cat "$RELEASES_DIR/ai-windows-x64.zip.sha256" | cut -d' ' -f1)
    NestedInstallerType: portable
    NestedInstallerFiles:
      - RelativeFilePath: ai-windows-x64.exe
        PortableCommandAlias: ai
ManifestType: installer
ManifestVersion: 1.4.0
EOF

    # Create locale manifest
    cat > "$manifest_dir/locale.yaml" << EOF
PackageIdentifier: simpletoolsindiaorg.ai
PackageVersion: ${version}
PackageLocale: en-US
Publisher: simpletoolsindiaorg
PublisherUrl: https://github.com/simpletoolsindiaorg
PublisherSupportUrl: https://github.com/simpletoolsindiaorg/ai/issues
Author: simpletoolsindiaorg
PackageName: ai
PackageUrl: https://github.com/simpletoolsindiaorg/ai
License: MIT
LicenseUrl: https://github.com/simpletoolsindiaorg/ai/blob/main/LICENSE
ShortDescription: Terminal-based AI coding agent
Description: |
  ai is a terminal-based, self-extensible AI coding agent that reads your project,
  edits files, runs shell commands, and queries the web — all in a single agent loop.
Tags:
  - ai
  - coding
  - assistant
  - terminal
  - cli
ManifestType: defaultLocale
ManifestVersion: 1.4.0
EOF

    log_success "Created WinGet manifest: $manifest_dir"
}

# ============================================================================
# Create Scoop Manifest
# ============================================================================

create_scoop_manifest() {
    local version="$1"
    local manifest_file="$RELEASES_DIR/ai.json"

    log_info "Creating Scoop manifest..."

    cat > "$manifest_file" << EOF
{
    "version": "${version}",
    "description": "Terminal-based AI coding agent",
    "homepage": "https://github.com/simpletoolsindiaorg/ai",
    "license": "MIT",
    "architecture": {
        "64bit": {
            "url": "https://github.com/simpletoolsindiaorg/ai/releases/download/v${version}/ai-windows-x64.zip",
            "hash": "$(cat "$RELEASES_DIR/ai-windows-x64.zip.sha256" | cut -d' ' -f1)"
        }
    },
    "bin": "ai-windows-x64.exe",
    "checkver": {
        "github": "https://github.com/simpletoolsindiaorg/ai"
    },
    "autoupdate": {
        "architecture": {
            "64bit": {
                "url": "https://github.com/simpletoolsindiaorg/ai/releases/download/v\$version/ai-windows-x64.zip"
            }
        }
    }
}
EOF

    log_success "Created Scoop manifest: $manifest_file"
}

# ============================================================================
# Create npm Platform Packages
# ============================================================================

create_npm_platform_packages() {
    local version="$1"

    log_info "Creating npm platform packages..."

    # Create platform-specific packages
    for platform in "${PLATFORMS[@]}"; do
        local os arch package_name

        # Parse platform
        os=$(echo "$platform" | cut -d- -f1)
        arch=$(echo "$platform" | cut -d- -f2)

        # Set package name
        package_name="@simpletoolsindiaorg/ai-${platform}"

        # Create package directory
        local package_dir="$RELEASES_DIR/npm/$platform"
        mkdir -p "$package_dir"

        # Create package.json
        cat > "$package_dir/package.json" << EOF
{
    "name": "${package_name}",
    "version": "${version}",
    "description": "ai binary for ${platform}",
    "os": ["${os}"],
    "cpu": ["${arch}"],
    "files": [
        "ai"
    ],
    "scripts": {
        "postinstall": "node postinstall.mjs"
    },
    "license": "MIT"
}
EOF

        # Copy binary
        if [ "$os" = "windows" ]; then
            cp "$DIST_DIR/ai-${platform}.exe" "$package_dir/ai.exe"
        else
            cp "$DIST_DIR/ai-${platform}" "$package_dir/ai"
            chmod +x "$package_dir/ai"
        fi

        # Create postinstall script
        cat > "$package_dir/postinstall.mjs" << 'EOF'
import { chmod, copyFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const binDir = join(homedir(), '.ai', 'bin');
const binName = process.platform === 'win32' ? 'ai.exe' : 'ai';
const srcPath = join(import.meta.dirname, binName);
const destPath = join(binDir, binName);

await mkdir(binDir, { recursive: true });
await copyFile(srcPath, destPath);
await chmod(destPath, 0o755);

console.log(`ai installed to ${destPath}`);
EOF

        log_success "Created npm package: $package_dir"
    done

    # Create main package with optional dependencies
    local main_package_dir="$RELEASES_DIR/npm/main"
    mkdir -p "$main_package_dir"

    cat > "$main_package_dir/package.json" << EOF
{
    "name": "@simpletoolsindiaorg/ai-coding-agent",
    "version": "${version}",
    "description": "Terminal-based AI coding agent",
    "main": "dist/cli.js",
    "bin": {
        "ai": "dist/cli.js"
    },
    "scripts": {
        "postinstall": "node postinstall.mjs"
    },
    "optionalDependencies": {
        "@simpletoolsindiaorg/ai-darwin-arm64": "${version}",
        "@simpletoolsindiaorg/ai-darwin-x64": "${version}",
        "@simpletoolsindiaorg/ai-linux-arm64": "${version}",
        "@simpletoolsindiaorg/ai-linux-x64": "${version}",
        "@simpletoolsindiaorg/ai-windows-x64": "${version}"
    },
    "os": [
        "darwin",
        "linux",
        "win32"
    ],
    "cpu": [
        "x64",
        "arm64"
    ],
    "license": "MIT"
}
EOF

    # Create postinstall script for main package
    cat > "$main_package_dir/postinstall.mjs" << 'EOF'
import { existsSync, readlinkSync, symlinkSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const binDir = join(homedir(), '.ai', 'bin');
const binName = process.platform === 'win32' ? 'ai.exe' : 'ai';
const binPath = join(binDir, binName);

// Check if platform-specific package installed the binary
if (existsSync(binPath)) {
    console.log(`ai binary found at ${binPath}`);
} else {
    // Try to find the binary from optional dependency
    const platform = `${process.platform}-${process.arch}`;
    const platformPackage = `@simpletoolsindiaorg/ai-${platform}`;

    try {
        const platformBin = require.resolve(`${platformPackage}/ai`);
        console.log(`Found platform binary: ${platformBin}`);
    } catch (e) {
        console.warn('Platform-specific binary not found. Using Node.js fallback.');
    }
}
EOF

    log_success "Created main npm package: $main_package_dir"
}

# ============================================================================
# Main Distribution Flow
# ============================================================================

main() {
    local version="${1:-}"

    if [ -z "$version" ]; then
        log_error "Usage: $0 <version>"
    fi

    log_info "Starting binary distribution for version ${version}..."

    # Create directories
    mkdir -p "$DIST_DIR" "$RELEASES_DIR"

    # Build binaries for all platforms
    for platform in "${PLATFORMS[@]}"; do
        build_binary "$platform"
    done

    # Create archives
    for platform in "${PLATFORMS[@]}"; do
        create_archive "$platform"
    done

    # Generate checksums
    generate_checksums

    # Create package manager manifests
    create_homebrew_formula "$version"
    create_winget_manifest "$version"
    create_scoop_manifest "$version"

    # Create npm platform packages
    create_npm_platform_packages "$version"

    log_success "Distribution artifacts created in $RELEASES_DIR"
    echo ""
    echo "Artifacts:"
    ls -lh "$RELEASES_DIR"
}

# ============================================================================
# Entry Point
# ============================================================================

main "$@"
