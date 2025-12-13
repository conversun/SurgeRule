# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Surge proxy configuration repository for iOS/macOS network traffic routing. Uses remote rule sets hosted on GitHub raw URLs.

## File Types

- **`.conf`**: Main configuration (`Custom.conf` is primary)
- **`.list`**: Rule lists for routing decisions (proxy, direct, reject, service-specific)
- **`.sgmodule`**: Surge modules that extend configuration with `%APPEND%` or `%INSERT%` directives

## Rule Syntax

```
DOMAIN,example.com              # Exact match
DOMAIN-SUFFIX,example.com       # Match domain + all subdomains
PROCESS-NAME,AppName            # Match by macOS process name
AND,((DEST-PORT,22), (GEOIP,CN)) # Logical combination
```

## Configuration Architecture

`Custom.conf` references remote rule sets via `RULE-SET` directives:
```
RULE-SET,https://raw.githubusercontent.com/conversun/SurgeRule/main/proxy.list,Proxy,extended-matching
```

**Rule Processing Order** (in `[Rule]` section):
1. Custom private rules (reject → direct → proxy → service-specific)
2. External rule sets (HTTPDNS, AdBlock, services)
3. IP-based rules (Telegram, streaming, domestic)
4. Fallback rules (LAN, GEOIP CN, FINAL)

**Proxy Groups** (in `[Proxy Group]` section):
- Service-specific groups: AI, Adobe, PayPal, Stripe, GitHub, SSH, etc.
- Region groups: 🇭🇰 HK, 🇺🇲 US, 🇨🇳 TW, 🇸🇬 SG, 🇯🇵 JP (use `smart` policy with regex filters)

## Module Directives

`.sgmodule` files use special directives to modify parent config:
- `%APPEND%` - Add to existing list
- `%INSERT%` - Insert at beginning

Example: `hostname = %APPEND% *.local, *.example.com`

## Editing Guidelines

- Rule order matters: specific rules before general ones
- Use `DOMAIN-SUFFIX` for services with multiple subdomains
- Use `DOMAIN` only for exact matches
- Group related entries with blank lines
- Comments use `#` (in lists) or `//` (to disable rules in conf)