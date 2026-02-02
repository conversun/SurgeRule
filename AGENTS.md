# AGENTS.md

Configuration guidelines for AI agents working with this Surge proxy rule repository.

## Repository Overview

Surge proxy configuration for iOS/macOS network traffic routing. Contains rule lists, main config, and extension modules. All rules are hosted on GitHub and referenced via raw URLs.

## File Types

| Extension | Purpose | Example |
|-----------|---------|---------|
| `.conf` | Main Surge configuration | `Custom.conf` (primary) |
| `.list` | Rule lists for routing | `proxy.list`, `direct.list`, `reject.list` |
| `.sgmodule` | Extension modules | `private.sgmodule`, `lg.sgmodule` |

## Build/Lint/Test Commands

**None.** This is a declarative configuration repository. Changes are validated by Surge app on device.

## Rule Syntax Reference

### Domain Rules (in .list files)
```
DOMAIN,example.com              # Exact domain match
DOMAIN-SUFFIX,example.com       # Domain + all subdomains
DOMAIN-KEYWORD,tracker          # Match if domain contains keyword
```

### Process Rules (macOS only)
```
PROCESS-NAME,AppName            # Match by process name (case-sensitive)
```

### Port & IP Rules
```
DEST-PORT,22                    # Match destination port
GEOIP,CN                        # Match by GeoIP country code
IP-CIDR,10.0.0.0/8              # Match IP range
```

### Logical Combinations
```
AND,((DEST-PORT,22), (GEOIP,CN))    # Both conditions must match
OR,((DOMAIN,a.com), (DOMAIN,b.com)) # Either condition matches
```

### Rule Set References (in .conf)
```
RULE-SET,https://raw.githubusercontent.com/user/repo/main/file.list,PolicyName,extended-matching
DOMAIN-SET,https://example.com/domains.conf,PolicyName,extended-matching
```

## Configuration Sections

Main `.conf` files use INI-style sections:
```
[General]      # Global settings (DNS, ports, timeouts)
[Replica]      # Traffic hiding/filtering options
[Proxy]        # Proxy server definitions
[Proxy Group]  # Policy groups for routing decisions
[Rule]         # Routing rules (ORDER MATTERS - first match wins)
[Host]         # Custom DNS host mappings
[URL Rewrite]  # URL modification rules
[MITM]         # Man-in-the-middle certificate config
```

## Code Style Guidelines

### Comment Syntax
```
# This is a comment in .list files
// This disables a rule in .conf files (keeps for reference)
# Chinese comments acceptable: # 广告拦截
```

### Rule Ordering (CRITICAL)
Rules are processed top-to-bottom. First match wins.

**Standard order in [Rule] section:**
1. Custom private rules (reject → direct → proxy → service-specific)
2. External rule sets (HTTPDNS, AdBlock, third-party)
3. IP-based rules (Telegram, streaming, domestic)
4. Fallback rules (LAN, GEOIP CN, FINAL)

### When to Use Each Rule Type
| Situation | Rule Type |
|-----------|-----------|
| Single exact domain | `DOMAIN` |
| Service with many subdomains | `DOMAIN-SUFFIX` |
| Pattern in domain names | `DOMAIN-KEYWORD` |
| macOS app-specific | `PROCESS-NAME` |
| Protocol/port targeting | `DEST-PORT` |

### Grouping Conventions
- Separate logical groups with blank lines
- Related domains together (e.g., all subdomains of a service)
- One rule per line, no inline comments after rules

### Proxy Group Naming
Use emoji flags for region groups: `🇭🇰 HK`, `🇺🇲 US`, `🇹🇼 TW`, `🇸🇬 SG`, `🇯🇵 JP`

Service groups use English names: `AI`, `PayPal`, `Stripe`, `GitHub`, `SSH`

## Module Files (.sgmodule)

### Header Format
```
#!name=Module Name
#!desc=Description of what this module does
#!category=CategoryName (optional)
```

### Directive Syntax
```
hostname = %APPEND% *.new-domain.com     # Add to existing list
hostname = %INSERT% *.priority.com       # Insert at beginning
```

## Common Patterns

### Adding a New Service Rule List
1. Create `servicename.list` with domain rules
2. Add proxy group in `Custom.conf` `[Proxy Group]` section
3. Add RULE-SET reference in `[Rule]` section (after custom private rules)

### Blocking a Domain
Add to `reject.list`:
```
DOMAIN-SUFFIX,blocked-service.com
```

### Direct Connection (Bypass Proxy)
Add to `direct.list`:
```
DOMAIN-SUFFIX,local-service.com
PROCESS-NAME,LocalApp
```

### Force Proxy
Add to `proxy.list`:
```
DOMAIN-SUFFIX,external-service.com
```

## External Rule Sources

This repo uses external rule sets from:
- `ruleset.skk.moe` - Sukka's comprehensive rule sets
- `blackmatrix7/ios_rule_script` - Community-maintained service rules
- `dler-io/Rules` - Dler Cloud rule sets

CDN URLs:
```
https://cdn.jsdelivr.net/gh/user/repo@branch/path
https://testingcf.jsdelivr.net/gh/user/repo@branch/path
https://raw.githubusercontent.com/user/repo/branch/path
```

## Validation Checklist

Before committing:
- [ ] Rule syntax correct (no typos in rule types)
- [ ] URLs valid and accessible
- [ ] New rules placed in correct order
- [ ] No duplicate rules
- [ ] Policy names match existing proxy groups

## Troubleshooting

**Rule not working?**
1. Check rule order - earlier rules take precedence
2. Verify domain/process name spelling (case-sensitive)
3. Ensure proxy group exists in `[Proxy Group]`

**MITM not intercepting?**
- Add hostname to `[MITM]` section's `hostname` list
- Use `%APPEND%` in modules to add without overwriting
