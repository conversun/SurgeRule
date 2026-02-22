# AGENTS.md

Guidelines for AI agents working in this Surge proxy rule repository.

## Repository Overview

Multi-platform proxy configuration for iOS/macOS network traffic routing. Configs exist for **Surge** (primary), **Quantumult X**, **Clash/mihomo**, and **Shadowrocket**. Rules are hosted on GitHub (`conversun/SurgeRule`, `main` branch) and referenced via raw URLs.

## Build/Lint/Test

**None.** Declarative config repo — no build system, no linter, no tests. Changes are validated by the proxy app on-device. Before committing, manually verify: correct rule syntax, valid URLs, no duplicates, proper ordering, and policy names that match existing proxy groups.

## File Structure

```
Custom_Surge.conf          # Primary Surge configuration
Custom_QX.conf             # Quantumult X configuration
Custom_Clash.yaml          # Clash/mihomo configuration
shadowrocket-social.conf   # Shadowrocket (social apps only)
ssk.conf                   # Sukka ruleset reference template
private/                   # Custom rule lists (referenced by RULE-SET URLs)
  reject.list              #   Domains to block
  direct.list              #   Domains to bypass proxy
  proxy.list               #   Domains to force proxy
  ssh.list                 #   SSH port rules
  smm.list                 #   Social media marketing
  ai.list                  #   AI service domains
  apple.list               #   Apple-specific domains
  tail.list                #   Tailscale/VPN network ranges
module/                    # Surge extension modules (.sgmodule)
script/                    # Sub-Store proxy injection scripts (.js)
docs/                      # Reference documentation
```

## Rule Syntax (for .list files)

```
DOMAIN,example.com                       # Exact domain match
DOMAIN-SUFFIX,example.com               # Domain + all subdomains
DOMAIN-KEYWORD,tracker                  # Match keyword in domain
PROCESS-NAME,AppName                    # macOS process (case-sensitive)
DEST-PORT,22                            # Destination port
IP-CIDR,10.0.0.0/8,no-resolve          # IP range (add no-resolve for non-DNS)
GEOIP,CN                                # GeoIP country
AND,((DEST-PORT,22), (GEOIP, CN))       # Logical AND
OR,((DOMAIN,a.com), (DOMAIN,b.com))     # Logical OR
```

### When to Use Each Type

| Situation | Type | Example |
|-----------|------|---------|
| Single exact domain | `DOMAIN` | `DOMAIN,app.plex.tv` |
| Service with subdomains | `DOMAIN-SUFFIX` | `DOMAIN-SUFFIX,anthropic.com` |
| Pattern across domains | `DOMAIN-KEYWORD` | `DOMAIN-KEYWORD,smm` |
| macOS app bypass | `PROCESS-NAME` | `PROCESS-NAME,WeChat` |
| Port-based routing | `DEST-PORT` | `DEST-PORT,22` |
| VPN/internal ranges | `IP-CIDR` | `IP-CIDR,100.64.0.0/10,no-resolve` |

## Configuration Sections (Surge .conf)

INI-style sections, processed in this order:
```
[General]      # DNS, ports, timeouts, connectivity tests
[Replica]      # Traffic hiding/filtering
[Proxy]        # Server definitions (usually empty — imported from subscription)
[Proxy Group]  # Policy groups for routing
[Rule]         # Routing rules (ORDER MATTERS — first match wins)
[Host]         # Custom DNS mappings
[URL Rewrite]  # URL modification rules
[Script]       # Script hooks
[MITM]         # TLS interception config
```

## Rule Ordering (CRITICAL — first match wins)

The `[Rule]` section in `Custom_Surge.conf` uses numbered section headers:

```
# ====== 1. 自定义规则 ======     → private/ lists (reject → direct → proxy → service)
# ====== 2. 广告拦截 ======       → Ad blocking (skk.moe, AWAvenue)
# ====== 3. 国内直连 ======       → China-direct (Apple CN, China Media, SteamCN)
# ====== 4. AI ======             → AI services (Claude, OpenAI, skk.moe/ai)
# ====== 5. 流媒体 ======         → Streaming (Netflix, TikTok, YouTube, GlobalMedia)
# ====== 6. 服务 ======           → Services (Apple, GitHub, Telegram, Mail)
# ====== 7. 金融 ======           → Finance (Crypto, PayPal, Stripe)
# ====== 8. 工具 ======           → Tools (Speedtest)
# ====== 9. CDN & 下载 ======     → CDN & downloads
# ====== 10. 国内域名 ======      → Domestic domains (NeteaseMusic, domestic)
# ====== 11. IP 规则 ======       → IP-based rules (Telegram IP, reject IP)
# ====== 12. 兜底 ======          → Fallback (Proxy list, China, LAN, GEOIP CN, FINAL)
```

**New rules go in the appropriate numbered section.** Never append to the end.

## Proxy Group Naming

- **Regions**: Emoji flag + code — `🇭🇰 HK`, `🇺🇲 US`, `🇼🇸 TW`, `🇸🇬 SG`, `🇯🇵 JP`
- **Services**: English names — `AI`, `Media`, `TikTok`, `GitHub`, `Telegram`, `Tunnel`, `SMM`
- **Finance**: English names — `Crypto`, `PayPal`, `Stripe`
- **Tools**: English names — `Speed`
- Region groups use `smart` policy with `policy-regex-filter` and `(?!.*(Game))` negative lookahead

## Comment Conventions

- `#` for comments in `.list` and `.conf` files
- `//` to disable a rule while keeping it for reference (in `.conf` only)
- Chinese comments are standard: `# 广告拦截`, `# 兜底`
- Section headers use: `# ====== N. 名称 ======`
- Subsection comments use: `# --- 描述 ---`
- Group related domains together; separate logical groups with blank lines
- One rule per line, no inline comments after rules

## Module Files (.sgmodule)

```
#!name=Module Name
#!desc=Description
#!category=CategoryName    (optional)

[MITM]
hostname = %APPEND% *.example.com     # Add to existing hostname list
```

Directives: `%APPEND%` adds to existing list, `%INSERT%` prepends. Always use these to avoid overwriting the main config's values.

## External Rule Sources

| Source | Usage |
|--------|-------|
| `ruleset.skk.moe` | Ad blocking, CDN, domestic, AI, streaming |
| `blackmatrix7/ios_rule_script` | Service-specific rules (GitHub, Telegram, Netflix, etc.) |
| `TG-Twilight/AWAvenue-Ads-Rule` | Additional ad blocking |

URL patterns for referencing:
```
https://raw.githubusercontent.com/conversun/SurgeRule/main/private/file.list
https://cdn.jsdelivr.net/gh/user/repo@branch/path
https://ruleset.skk.moe/List/non_ip/rule.conf
```

## Common Tasks

### Add a domain to an existing policy
Edit the appropriate `private/*.list` file. No config changes needed.

### Add a new service with its own policy
1. Create `private/servicename.list` with domain rules
2. Add policy group in `[Proxy Group]` section of `Custom_Surge.conf`
3. Add `RULE-SET` in `[Rule]` at the correct numbered section
4. If multi-platform: replicate in `Custom_QX.conf` and `Custom_Clash.yaml`

### Block a domain
Add to `private/reject.list`:
```
DOMAIN-SUFFIX,unwanted-service.com
```

### Cross-platform consistency
When modifying routing logic, check if the same change is needed across:
- `Custom_Surge.conf` (Surge)
- `Custom_QX.conf` (Quantumult X) — uses different syntax for policies/filters
- `Custom_Clash.yaml` (Clash) — YAML format, `rule-providers` + `rules` sections
- `shadowrocket-social.conf` (Shadowrocket) — minimal, social-apps-only config

### Scripts (Sub-Store)
`script/clash_proxy.js` injects proxy nodes into `Custom_Clash.yaml` via Sub-Store. Uses `ProxyUtils` API. `script/surge_proxy.js` is gitignored (contains subscription secrets).

## Validation Checklist

- [ ] Rule type spelled correctly (`DOMAIN-SUFFIX` not `DOMAIN-SURFIX`)
- [ ] URLs accessible (test with curl)
- [ ] New rules in correct numbered section (not at EOF)
- [ ] Policy name matches an existing `[Proxy Group]` entry
- [ ] No duplicate rules across `private/*.list` files
- [ ] `extended-matching` flag included where needed in RULE-SET lines
- [ ] For modules: `%APPEND%`/`%INSERT%` used (not bare assignment)
