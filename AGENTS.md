# AGENTS.md

Guidelines for AI agents working in this Surge proxy rule repository.

## Repository Overview

Multi-platform proxy configuration for iOS/macOS network traffic routing. Configs exist for **Surge** (primary), **Quantumult X**, **Clash/mihomo**, and **Shadowrocket**. Rules are hosted on GitHub (`conversun/SurgeRule`, `main` branch) and referenced via raw URLs.

## Build/Lint/Test

**None.** Declarative config repo — no build system, no linter, no tests. Changes are validated by the proxy app on-device. Before committing, manually verify: correct rule syntax, valid URLs, no duplicates, proper ordering, and policy names that match existing proxy groups.

## File Structure

```
Custom_Surge.conf          # Primary Surge config (macOS/iOS)
Custom_QX.conf             # Quantumult X config (iOS)
Custom_Clash.yaml          # Clash/mihomo config (cross-platform)
shadowrocket-social.conf   # Shadowrocket (social apps only — Instagram/TikTok/YouTube)
shadowrocket-proxy.conf    # Shadowrocket (GFW proxy list — broader coverage)
ssk.conf                   # Sukka ruleset reference template (not deployed)
private/                   # Custom rule lists (referenced via raw GitHub URLs)
  reject.list              #   Domains to block (Parallels, etc.)
  direct.list              #   Domains/processes to bypass proxy
  proxy.list               #   Domains to force proxy
  ai.list                  #   AI service domains (Claude, Anthropic)
  apple.list               #   Apple-specific domains
  check.list               #   IP check & DNS leak test tools
  hkbank.list              #   Hong Kong banking domains (traditional + virtual banks)
  gia.list                 #   CN2 GIA / CMIN2 / CU9929 VPS ASNs (direct, no proxy)
  ali.list                 #   Alibaba US ASN (direct overseas CDN for Taobao/Alipay)
module/                    # Surge extension modules (.sgmodule)
  custom-rules.sgmodule    #   Injects private/direct.list + private/proxy.list
  ad-block.sgmodule        #   iOS ad blocking (REJECT-DROP)
  ad-block-lite.sgmodule   #   macOS lite ad blocking
  jpark.sgmodule           #   JParking domain blocks + API rejects
  jpark-qx.conf            #   JParking rules for Quantumult X
  ponte-server.sgmodule    #   Ponte LAN direct (uses template arguments)
  ponte-client.sgmodule    #   Ponte client config
  private.sgmodule         #   MITM hostname additions
  hide-qbittorrent.sgmodule #  Hide BT client traffic in Replica
  lg.sgmodule              #   VIF excluded routes (LG ThinQ, casting)
script/                    # Sub-Store proxy injection scripts (.js)
  clash_proxy.js           #   Injects proxies into Custom_Clash.yaml
  surge_proxy.js           #   Injects proxies into Surge (untracked — contains secrets)
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
IP-ASN,12345,no-resolve                 # Match by AS number (always add no-resolve)
AND,((DEST-PORT,22), (GEOIP, CN))       # Logical AND
```

Use `DOMAIN-SUFFIX` for services with subdomains, `DOMAIN` only for exact matches, `PROCESS-NAME` for macOS app bypass. Always add `no-resolve` to IP-CIDR and IP-ASN rules.

## Rule Ordering in Custom_Surge.conf (first match wins)

```
# ====== 1. 测速 / 工具 ======              → Speedtest, Check (IP/DNS leak tests)
# ====== 2. AI ======                       → AI services (skk.moe/ai ruleset)
# ====== 3. CDN & 下载 ======               → CDN domainsets + download rules
# ====== 4. 金融 ======                     → Crypto, PayPal, Stripe
# ====== 5. 流媒体 ======                   → TikTok, skk.moe stream ruleset
# ====== 6. 服务 ======                     → Telegram, Apple, Microsoft, Mail/SSH, GitHub, Google
# ====== 7. 海外常见域名 ======             → skk.moe global ruleset (avoid local DNS for known global domains)
# ====== 8. 国内常见域名 ======             → skk.moe domestic/direct/lan rulesets
# ====== 9. IP 规则 ======                  → reject/lan/domestic/china_ip/GIA IP rules
# ====== 10. 兜底 ======                    → FINAL,Final,dns-failed
```

**New rules go in the appropriate numbered section.** Never append to the end. Ad blocking is handled by modules (`ad-block.sgmodule`), not the main conf.

## Proxy Groups (policy names used in rules)

| Category | Groups |
|----------|--------|
| Main | `Proxy`, `Final` |
| AI | `AI` |
| Streaming | `Media`, `TikTok` |
| Services | `Apple`, `GitHub`, `Google`, `Telegram`, `Tunnel` (mail+SSH) |
| Finance | `Crypto`, `PayPal`, `Stripe` |
| Tools | `Speed`, `Check`, `CDN` |
| Special | `🏠 ISP` (US nodes via regex) |
| Regions | `🇭🇰 HK`, `🇺🇲 US`, `🇼🇸 TW`, `🇸🇬 SG`, `🇯🇵 JP` |

Region groups use `smart` policy with `policy-regex-filter` and `(?!.*(Game))` negative lookahead. New rules MUST use an existing group name — adding a group requires editing `[Proxy Group]`.

## Cross-Platform Naming

| Surge | QX | Clash |
|-------|-----|-------|
| `Proxy` | `Outside` | `Proxy` |
| `AI` | `AI Suite` | `AI` |
| `Media` | `Global Media` | `Media` |
| `Speed` | `Speedtest` | `Speedtest` |
| `Tunnel` | `Mail` | `Tunnel` |

When modifying routing logic, check if the same change is needed in all configs.

## Module Files (.sgmodule)

```
#!name=Module Name
#!desc=Description
#!category=CategoryName
#!arguments=subnet:192.168.1.0/24     # Template arguments (optional)

[Rule]
IP-CIDR,{{{subnet}}},DIRECT           # Use {{{var}}} for argument substitution

[MITM]
hostname = %APPEND% *.example.com     # %APPEND% adds to existing list
```

Directives: `%APPEND%` adds to existing list, `%INSERT%` prepends. Always use these — bare assignment overwrites the main config's values.

## Script Conventions (Sub-Store)

`clash_proxy.js` uses Sub-Store's API:
- `produceArtifact()` — fetch proxy collection
- `ProxyUtils.parse(raw)` / `ProxyUtils.produce(proxies, platform)` — parse/serialize
- `$content` — the target config file content (mutated in place)

## Comment Conventions

- `#` for comments in `.list` and `.conf` files
- Chinese comments are standard: `# 广告拦截`, `# 兜底`
- Section headers: `# ====== N. 名称 ======`
- Subsection comments: `# --- 描述 ---`
- Group related domains; separate logical groups with blank lines
- One rule per line, no inline comments after rules

## Commit Style

Terse conventional commits: `feat: client`, `fix: arg`, `update`. No long descriptions needed.

## Common Tasks

### Add a domain to an existing policy
Edit the appropriate `private/*.list` file. No config changes needed.

### Add a new service with its own policy
1. Create `private/servicename.list` with domain rules
2. Add policy group in `[Proxy Group]` of `Custom_Surge.conf`
3. Add `RULE-SET` in `[Rule]` at the correct numbered section
4. If multi-platform: replicate in `Custom_QX.conf` and `Custom_Clash.yaml` (different syntax)

### Block a domain
Add to `private/reject.list`: `DOMAIN-SUFFIX,unwanted.com`

## Validation Checklist

- [ ] Rule type spelled correctly (`DOMAIN-SUFFIX` not `DOMAIN-SURFIX`)
- [ ] Policy name matches an existing `[Proxy Group]` entry exactly
- [ ] New rules in correct numbered section (not at EOF)
- [ ] `extended-matching` flag on RULE-SET lines in Surge conf
- [ ] No duplicate rules across `private/*.list` files
- [ ] URLs accessible (test with curl if uncertain)
- [ ] For modules: `%APPEND%`/`%INSERT%` used (not bare assignment)
- [ ] Clash rule-providers use correct `behavior` (classical/domain) and `format` (text/yaml)
- [ ] `no-resolve` on all IP-CIDR and IP-ASN rules

## External Rule Sources

| Source | URL Pattern | Usage |
|--------|-------------|-------|
| skk.moe | `https://ruleset.skk.moe/List/non_ip/*.conf` | Ad blocking, CDN, AI, domestic |
| blackmatrix7 | `https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/*.list` | Service-specific rules |
| AWAvenue | `https://cdn.jsdelivr.net/gh/TG-Twilight/AWAvenue-Ads-Rule@main/Filters/*` | Additional ad blocking |
| This repo | `https://raw.githubusercontent.com/conversun/SurgeRule/main/private/*.list` | Custom private rules |
