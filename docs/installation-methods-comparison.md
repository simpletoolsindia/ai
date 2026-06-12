# Installation Methods Comparison

This document compares the installation methods used by popular coding assistants and describes how ai implements similar patterns.

## Overview of Coding Assistant Installation Methods

| Tool | npm | Homebrew | pip | Binary | Script | Source |
|------|-----|----------|-----|--------|--------|--------|
| **Claude Code** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **GitHub Copilot CLI** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| **OpenAI Codex** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **OpenCode** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Aider** | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| **ai** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Detailed Comparison

### 1. Claude Code

**Installation Methods:**
- **npm:** `npm install -g @anthropic-ai/claude-code`
- **Homebrew:** `brew install claude-code`
- **Native Binary:** `curl -fsSL https://claude.ai/install.sh | bash`
- **Windows:** `irm https://claude.ai/install.ps1 | iex`

**Key Features:**
- Per-platform optional dependencies (e.g., `@anthropic-ai/claude-code-darwin-arm64`)
- Automatic updates in background
- Zero-dependency native installer
- `claude doctor` for diagnostics

### 2. GitHub Copilot CLI

**Installation Methods:**
- **npm:** `npm install -g @github/copilot`
- **Homebrew:** `brew install github/copilot/copilot`
- **WinGet:** `winget install GitHub.CopilotCLI`
- **Install Script:** `curl -fsSL https://github.com/github/copilot-cli/raw/main/install.sh | bash`

**Key Features:**
- SHA256 checksum verification
- Automatic PATH configuration
- Supports macOS, Linux, Windows (WSL)

### 3. OpenAI Codex

**Installation Methods:**
- **npm:** `npm install -g @openai/codex`
- **Homebrew:** `brew install --cask codex`
- **Direct Binary:** Download from GitHub Releases
- **Install Script:** `curl -fsSL https://chatgpt.com/codex/install.sh | bash`

**Key Features:**
- Per-platform optional dependencies
- Automatic updates
- Cross-platform support (macOS, Linux, Windows)

### 4. OpenCode

**Installation Methods:**
- **npm:** `npm i -g opencode-ai@latest`
- **Homebrew:** `brew install opencode`
- **Scoop:** `scoop install extras/opencode`
- **Chocolatey:** `choco install opencode`
- **Install Script:** `curl -fsSL https://opencode.ai/install | bash`
- **Source:** Build from GitHub

**Key Features:**
- 11-platform matrix support
- Platform-specific native binaries as optional dependencies
- Automatic PATH configuration
- Post-install diagnostics

### 5. Aider

**Installation Methods:**
- **pip:** `pip install aider-chat`
- **Installer:** `python -m pip install aider-install && aider-install`
- **Source:** Build from GitHub

**Key Features:**
- Python-based installation
- Dedicated installer package
- Virtual environment support

---

## How ai Implements These Patterns

### 1. npm Installation

**Similar to Claude Code and Codex:**

```bash
npm install -g @simpletoolsindiaorg/ai-coding-agent
```

**Implementation:**
- Per-platform optional dependencies (planned)
- Post-install script for binary linking
- Automatic native dependency rebuilding

### 2. Homebrew Installation

**Similar to GitHub Copilot CLI:**

```bash
brew tap simpletoolsindiaorg/ai
brew install ai
```

**Implementation:**
- Custom tap with formula
- Automatic platform detection
- Checksum verification

### 3. Binary Installation

**Similar to Claude Code and Codex:**

```bash
curl -fsSL https://github.com/simpletoolsindiaorg/ai/releases/latest/download/ai-darwin-arm64.tar.gz | tar xz
```

**Implementation:**
- Prebuilt binaries for 5 platforms
- SHA256 checksum verification
- Automatic PATH configuration

### 4. Script Installation

**Similar to all tools:**

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindiaorg/ai/main/install.sh | bash
```

**Implementation:**
- Auto-detection of installation method
- Fallback chain (Homebrew → npm → binary → source)
- User data backup
- PATH configuration

### 5. Package Manager Support

**Planned:**

| Package Manager | Status | Command |
|----------------|--------|---------|
| Homebrew | ✅ Implemented | `brew install ai` |
| WinGet | ✅ Implemented | `winget install simpletoolsindiaorg.ai` |
| Scoop | ✅ Implemented | `scoop install ai` |
| Chocolatey | 🔜 Planned | `choco install ai` |
| apt | 🔜 Planned | `apt install ai` |
| yum | 🔜 Planned | `yum install ai` |

---

## Best Practices from Other Tools

### 1. Per-Platform Optional Dependencies

**Claude Code Pattern:**
```json
{
  "optionalDependencies": {
    "@anthropic-ai/claude-code-darwin-arm64": "1.0.0",
    "@anthropic-ai/claude-code-darwin-x64": "1.0.0",
    "@anthropic-ai/claude-code-linux-arm64": "1.0.0",
    "@anthropic-ai/claude-code-linux-x64": "1.0.0"
  }
}
```

**ai Implementation:**
```json
{
  "optionalDependencies": {
    "@simpletoolsindiaorg/ai-darwin-arm64": "0.85.3",
    "@simpletoolsindiaorg/ai-darwin-x64": "0.85.3",
    "@simpletoolsindiaorg/ai-linux-arm64": "0.85.3",
    "@simpletoolsindiaorg/ai-linux-x64": "0.85.3",
    "@simpletoolsindiaorg/ai-windows-x64": "0.85.3"
  }
}
```

### 2. Checksum Verification

**GitHub Copilot CLI Pattern:**
```bash
# Download checksum
curl -LO https://github.com/.../SHA256SUMS.txt

# Verify binary
shasum -a 256 -c SHA256SUMS.txt
```

**ai Implementation:**
```bash
# Download checksum
curl -LO https://github.com/simpletoolsindiaorg/ai/releases/latest/download/checksums.sha256

# Verify binary
shasum -a 256 -c checksums.sha256
```

### 3. Automatic Updates

**Claude Code Pattern:**
```bash
claude update
# or
claude --update
```

**ai Implementation:**
```bash
ai update
# or
ai update self
```

### 4. Diagnostics Command

**Claude Code Pattern:**
```bash
claude doctor
```

**ai Implementation:**
```bash
ai --diagnostics
# or
/diagnostics
```

---

## Implementation Files

### New Files Created:

1. **`install-universal.sh`** - Universal installer supporting multiple methods
2. **`scripts/distribute-binary.sh`** - Binary distribution script
3. **`.github/workflows/ci-v2.yml`** - Enhanced CI/CD pipeline
4. **`docs/deployment.md`** - Comprehensive deployment documentation

### Package Manager Manifests:

1. **Homebrew Formula** - `ai.rb`
2. **WinGet Manifest** - `version.yaml`, `installer.yaml`, `locale.yaml`
3. **Scoop Manifest** - `ai.json`
4. **npm Platform Packages** - Per-platform optional dependencies

---

## Future Improvements

### 1. Additional Package Managers

- **Chocolatey** (Windows)
- **apt** (Debian/Ubuntu)
- **yum** (RHEL/CentOS)
- **pacman** (Arch Linux)
- **nix** (NixOS)

### 2. Container Support

- **Docker Hub** - Official image
- **GitHub Container Registry** - ghcr.io
- **OCI Registry** - Generic container registry

### 3. Auto-Update Mechanism

- Background update checking
- Automatic binary replacement
- Version rollback support

### 4. Installation Analytics

- Track installation methods
- Monitor success/failure rates
- Collect platform statistics

---

## Conclusion

ai implements a comprehensive set of installation methods that match or exceed those used by other popular coding assistants. The universal installer supports multiple methods with automatic fallback, and the distribution script creates artifacts for all major package managers.

By following the patterns established by Claude Code, GitHub Copilot CLI, OpenAI Codex, and OpenCode, ai provides a familiar and reliable installation experience for developers across all platforms.
