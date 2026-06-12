# Deployment Guide

This document describes the deployment, installation, and release processes for the ai project.

## Table of Contents

- [Installation Methods](#installation-methods)
- [Quick Install](#quick-install)
- [Package Managers](#package-managers)
- [Prebuilt Binaries](#prebuilt-binaries)
- [Building from Source](#building-from-source)
- [Docker](#docker)
- [Configuration](#configuration)
- [Upgrading](#upgrading)
- [Uninstalling](#uninstalling)
- [Release Process](#release-process)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

---

## Installation Methods

ai supports multiple installation methods to suit different user preferences:

| Method | Best For | Command |
|--------|----------|---------|
| **Quick Install** | Most users | `curl -fsSL .../install.sh \| bash` |
| **npm** | Node.js developers | `npm install -g @simpletoolsindiaorg/ai-coding-agent` |
| **Homebrew** | macOS users | `brew install simpletoolsindiaorg/ai/ai` |
| **Prebuilt Binary** | Offline environments | Download from GitHub Releases |
| **Source Build** | Contributors | `git clone` + `npm run build` |

---

## Quick Install

The recommended installation method for most users:

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindiaorg/ai/main/install.sh | bash
```

This will:
1. Detect your operating system and architecture
2. Install ai via npm (preferred) or download a prebuilt binary
3. Configure your PATH
4. Verify the installation
5. Display next steps

### Options

```bash
# Install via npm (default)
curl -fsSL .../install.sh | bash

# Install prebuilt binary
curl -fsSL .../install.sh | bash -s -- --binary

# Build from source
curl -fsSL .../install.sh | bash -s -- --source
```

---

## Package Managers

### npm

```bash
npm install -g @simpletoolsindiaorg/ai-coding-agent
```

### Homebrew (macOS/Linux)

```bash
brew tap simpletoolsindiaorg/ai
brew install ai
```

### Windows (winget)

```powershell
winget install simpletoolsindiaorg.ai
```

### Windows (Scoop)

```powershell
scoop bucket add simpletoolsindiaorg https://github.com/simpletoolsindiaorg/scoop-bucket
scoop install ai
```

---

## Prebuilt Binaries

Download the appropriate binary for your platform from [GitHub Releases](https://github.com/simpletoolsindiaorg/ai/releases/latest).

### Supported Platforms

| Platform | Architecture | Binary Name |
|----------|--------------|-------------|
| macOS | Apple Silicon (ARM64) | `ai-darwin-arm64` |
| macOS | Intel (x64) | `ai-darwin-x64` |
| Linux | x64 | `ai-linux-x64` |
| Linux | ARM64 | `ai-linux-arm64` |
| Windows | x64 | `ai-windows-x64.exe` |

### Installation Steps

1. Download the binary for your platform
2. Make it executable (Unix): `chmod +x ai-*`
3. Move to a directory in your PATH: `mv ai-* /usr/local/bin/ai`
4. Verify: `ai --version`

### Verify Checksums

Download `checksums.sha256` and verify:

```bash
shasum -a 256 -c checksums.sha256
```

---

## Building from Source

### Prerequisites

- Node.js >= 22.19.0
- npm >= 10.0
- Git

### Steps

```bash
# Clone repository
git clone https://github.com/simpletoolsindiaorg/ai.git
cd ai

# Install dependencies
npm install --ignore-scripts

# Build packages
npm run build

# Run from source
./ai-test.sh

# Or install globally
npm link
```

### Build for Production

```bash
# Full build with checks
npm run build
npm run check

# Create release artifacts
npm run release:local -- --out ./release
```

---

## Docker

### Official Image

```bash
docker pull simpletoolsindiaorg/ai:latest
docker run -it --rm simpletoolsindiaorg/ai
```

### Build Custom Image

```dockerfile
FROM node:22-slim

RUN npm install -g @simpletoolsindiaorg/ai-coding-agent

WORKDIR /workspace
ENTRYPOINT ["ai"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  ai:
    image: simpletoolsindiaorg/ai:latest
    volumes:
      - .:/workspace
      - ~/.ai:/root/.ai
    stdin_open: true
    tty: true
```

---

## Configuration

### Configuration Files

| File | Location | Purpose |
|------|----------|---------|
| `settings.json` | `~/.ai/agent/` | Global settings |
| `models.json` | `~/.ai/agent/` | Custom model definitions |
| `auth.json` | `~/.ai/agent/` | Authentication credentials |
| `keybindings.json` | `~/.ai/agent/` | Custom keybindings |
| `.ai/settings.json` | Project root | Project-specific settings |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AI_DEFAULT_MODEL` | Default model to use |
| `AI_DEFAULT_PROVIDER` | Default provider |
| `AI_OFFLINE` | Disable network operations |
| `AI_TELEMETRY` | Enable/disable telemetry |
| `AI_CODING_AGENT_DIR` | Override config directory |

### Authentication

```bash
# Start ai
ai

# Login with provider
/login

# Or set API key directly
export ANTHROPIC_API_KEY=your-key
export OPENAI_API_KEY=your-key
```

---

## Upgrading

### Via Installer

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindiaorg/ai/main/install.sh | bash
```

The installer will:
1. Detect existing installation
2. Backup configuration
3. Upgrade in place
4. Preserve user data

### Via npm

```bash
npm update -g @simpletoolsindiaorg/ai-coding-agent
```

### Via ai

```bash
ai update
# or
ai update self
```

### Manual Upgrade

1. Download new binary
2. Replace existing binary
3. Restart ai

---

## Uninstalling

### Quick Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/simpletoolsindiaorg/ai/main/uninstall.sh | bash
```

### Options

```bash
# Standard uninstall (preserves configuration)
curl -fsSL .../uninstall.sh | bash

# Purge all data
curl -fsSL .../uninstall.sh | bash -s -- --purge
```

### Manual Uninstall

1. Remove binary: `rm ~/.ai/bin/ai`
2. Remove npm package: `npm uninstall -g @simpletoolsindiaorg/ai-coding-agent`
3. Remove configuration: `rm -rf ~/.ai/agent`
4. Remove PATH entry from shell config

---

## Release Process

### Version Management

ai uses **lockstep versioning** — all four packages share the same version number.

### Release Steps

1. **Update Changelog**
   ```bash
   # Run /cl command in ai to update changelogs
   ai
   /cl
   ```

2. **Create Release**
   ```bash
   # Patch release (bug fixes)
   npm run release:patch

   # Minor release (new features)
   npm run release:minor

   # Major release (breaking changes)
   npm run release:major
   ```

3. **Automated Steps**
   - Version bump in all package.json files
   - Changelog update
   - Git commit and tag
   - Push to GitHub
   - CI/CD triggers

### Release Artifacts

Each release produces:
- npm packages (4 packages)
- Prebuilt binaries (4 platforms)
- GitHub Release with changelog
- Checksums (SHA-256)

---

## CI/CD Pipeline

### Pipeline Stages

1. **Quality Checks**
   - Linting
   - Formatting
   - Type checking
   - Dependency validation

2. **Build & Test**
   - Cross-platform builds
   - Unit tests
   - Integration tests
   - CLI verification

3. **Security Audit**
   - npm audit
   - Signature verification
   - Vulnerability scanning

4. **Binary Builds**
   - macOS (ARM64, x64)
   - Linux (x64, ARM64)
   - Windows (x64)

5. **Publishing**
   - npm packages
   - GitHub Release
   - Documentation update

### Quality Gates

No release proceeds if:
- Tests fail
- Linting fails
- Security scan fails
- Type checking fails
- Dependency validation fails

### Monitoring

- Daily security audits
- Dependency age enforcement
- Lockfile integrity checks
- Supply chain protection

---

## Troubleshooting

### Common Issues

#### Installation fails

**Problem:** `npm install` fails with permission errors

**Solution:**
```bash
# Fix npm permissions
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

#### Binary not found

**Problem:** `ai: command not found`

**Solution:**
```bash
# Add to PATH
echo 'export PATH="$HOME/.ai/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### Node.js version too old

**Problem:** Requires Node.js 22+

**Solution:**
```bash
# Install Node.js 22
nvm install 22
nvm use 22
```

#### Native dependency issues

**Problem:** `better-sqlite3` fails to load

**Solution:**
```bash
# Rebuild native dependencies
npm rebuild -g better-sqlite3
```

#### Network issues

**Problem:** Can't download packages

**Solution:**
```bash
# Use offline mode
AI_OFFLINE=1 ai

# Or configure proxy
npm config set proxy http://proxy:port
npm config set https-proxy http://proxy:port
```

### Getting Help

- **Documentation:** https://simpletoolsindia.github.io/ai/
- **GitHub Issues:** https://github.com/simpletoolsindiaorg/ai/issues
- **Discord:** https://discord.com/invite/3cU7Bz4UPx

---

## Security

### Supply Chain Security

- All dependencies pinned to exact versions
- Minimum release age enforcement (2 days)
- Lockfile integrity checks
- Daily security audits
- npm signature verification

### Binary Verification

Always verify binary checksums:

```bash
# Download checksum
curl -LO https://github.com/simpletoolsindiaorg/ai/releases/latest/download/checksums.sha256

# Verify binary
shasum -a 256 -c checksums.sha256
```

### Responsible Disclosure

Report security vulnerabilities to: security@simpletoolsindia.org

See [SECURITY.md](../SECURITY.md) for details.

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS (Apple Silicon) | ✅ Full | Primary development platform |
| macOS (Intel) | ✅ Full | Fully supported |
| Linux x64 | ✅ Full | Fully supported |
| Linux ARM64 | ✅ Full | Fully supported |
| Windows x64 | ⚠️ Partial | Via WSL, Git Bash, or Cygwin |
| Docker | ✅ Full | Official image available |

---

## Performance

### Binary Sizes

| Platform | Size |
|----------|------|
| macOS ARM64 | ~50MB |
| macOS x64 | ~50MB |
| Linux x64 | ~50MB |
| Linux ARM64 | ~50MB |

### Startup Time

- npm install: ~200ms
- Binary: ~100ms
- Source: ~500ms (with build)

### Memory Usage

- Idle: ~50MB
- Active: ~100-200MB
- With large context: ~500MB

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development setup and guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/simpletoolsindiaorg/ai.git
cd ai

# Install dependencies
npm install --ignore-scripts

# Build packages
npm run build

# Run tests
./test.sh

# Run from source
./ai-test.sh
```

### Release Checklist

- [ ] Update changelog
- [ ] Run full test suite
- [ ] Verify cross-platform builds
- [ ] Check security audit
- [ ] Review documentation
- [ ] Create release
- [ ] Verify npm publication
- [ ] Test installation
