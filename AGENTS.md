# AGENTS.md

Guidelines for AI agents working in this Surge proxy rule repository.

## Repository Overview

Multi-platform proxy configuration for iOS/macOS network traffic routing. Configs exist for **Surge** (primary), **Quantumult X**, **Clash/mihomo**, and **Shadowrocket**. Rules are hosted on GitHub (`conversun/SurgeRule`, `main` branch) and referenced via raw URLs.

## Build/Lint/Test

Generate with `node script/generate-configs.mjs` (Node.js 18+ or Bun, no dependencies).
Validate with `node script/generate-configs.mjs --check`, `bun test` and `git diff --check`.
Tests use Bun 1.3.10 without dependencies; `.github/workflows/config-check.yml` runs them on push and PR.
There is no client syntax linter. Final client validation is on-device.
The generator checks manifest structure, policy references and routing output freshness, not remote ruleset contents.
Before committing, manually verify correct rule syntax, valid URLs, no duplicates, ordering and client-specific behavior.

`Custom_Surge.conf`, `Custom_QX.conf` and `Custom_Clash.yaml` are generated artifacts.
Edit `routing/manifest.json` for routing, or `templates/` for platform-specific settings, then regenerate.
Keep generated files in the change so existing Sub-Store URLs continue working.
See `docs/rule-generation.md` for platform exceptions and maintenance commands.

## File Structure

```
Custom_Surge.conf          # Generated Surge config (macOS/iOS)
Custom_QX.conf             # Generated Quantumult X config (iOS)
Custom_Clash.yaml          # Generated Clash/mihomo config (cross-platform)
routing/manifest.json     # Shared routing sources, order, policies and platform exceptions
templates/                # Client-specific base configs with routing placeholders
shadowrocket-proxy.conf    # Shadowrocket (whitelist — skk.moe domestic direct, FINAL proxy)
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
  tunnel.list              #   Overrides to Tunnel policy (e.g. gh CLI vs ai.conf)
  steam.list               #   Steam download/content CDN (direct; excludes store/community)
module/                    # Surge extension modules (.sgmodule)
  custom-rules.sgmodule    #   Injects private/{proxy,direct,reject,tunnel,steam}.list
  ad-block.sgmodule        #   iOS ad blocking (REJECT-DROP)
  ad-block-lite.sgmodule   #   macOS lite ad blocking
  jpark.sgmodule           #   JParking domain blocks + API rejects
  jpark-qx.conf            #   JParking rules for Quantumult X
  ponte-server.sgmodule    #   Ponte LAN direct (uses template arguments)
  ponte-client.sgmodule    #   Ponte client config
  private.sgmodule         #   MITM hostname additions
  hide-qbittorrent.sgmodule #  Hide BT client traffic in Replica
  lg.sgmodule              #   VIF excluded routes (LG ThinQ, casting)
script/                    # Config generation and Sub-Store node injection
  generate-configs.mjs     #   Generates the three Custom_* configs; --check is read-only
  clash_proxy.js           #   Shared Clash node injection; COLLECTION and DNS_OVERRIDES arguments
  surge-file.js            #   Public Surge file injection; collection/managed URL/SMM/Ponte arguments
  surge_proxy.js           #   Injects proxies into Surge (untracked — contains secrets)
tests/                     # Bun generation and Sub-Store assembly regressions; no live subscriptions
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

**New rules go in the appropriate section of `routing/manifest.json`.** Never append after FINAL.
The manifest records platform-specific order; QX still uses skk global/domestic, while Surge/Clash use blackmatrix7.
Surge ad blocking is handled by modules (`ad-block.sgmodule`), not the main conf.

## Proxy Groups (policy names used in rules)

| Category | Groups |
|----------|--------|
| Main | `Proxy`, `Final` |
| AI | `AI` |
| Streaming | `Media`, `TikTok` |
| Services | `Apple`, `GitHub`, `Google`, `Telegram`, `Tunnel` (mail+SSH) |
| Finance | `Crypto`, `PayPal`, `Stripe` |
| Tools | `Speed`, `Check`, `CDN`, `GIA` |
| Special | `🏠 ISP` (US nodes via regex) |
| Regions | `🇭🇰 HK`, `🇺🇲 US`, `🇸🇬 SG`, `🇯🇵 JP` |

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

Directives `%APPEND%` / `%INSERT%` apply **only** to `key = value` fields (`[General]`, `[MITM]` `hostname`/`skip-server-cert-verify`/`tcp-connection`, `[WireGuard *]` keys) — without them, bare assignment overwrites the main config's values. **List sections** (`[Rule]`, `[Script]`, `[URL Rewrite]`, `[Header Rewrite]`, `[Host]`) do NOT support these directives — module entries are auto-prepended to the top of the main config's corresponding section ([source](https://manual.nssurge.com/others/module.html)).

## Script Conventions (Sub-Store)

Public file scripts `clash_proxy.js` and `surge-file.js` use Sub-Store's API:
- `produceArtifact()` — fetch proxy collection
- `ProxyUtils.yaml.safeLoad/safeDump` — parse and serialize native Clash artifacts
- `ProxyUtils.parse(raw)` — parse Surge node names
- `$arguments` — per-file collection, private DNS, managed URL and device overrides
- `$content` — the target config file content (mutated in place)

Keep private values in Sub-Store arguments, not in public scripts.
See `docs/substore-deployment.md` for the file/parameter matrix and staged deployment.

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
Edit the appropriate `private/*.list` file if it is already referenced by the target client.
Surge custom-rules module lists are not automatically loaded by Clash/QX; check the manifest before assuming cross-platform coverage.

### Add a new service with its own policy
1. Create `private/servicename.list` with domain rules
2. Add the policy group to each applicable base config in `templates/`
3. Add one source/policy entry to the appropriate section of `routing/manifest.json`
4. Add any cross-platform name mapping in `policyNames`, then generate and run `--check`

### Block a domain
Add to `private/reject.list`: `DOMAIN-SUFFIX,unwanted.com`

## Validation Checklist

- [ ] Rule type spelled correctly (`DOMAIN-SUFFIX` not `DOMAIN-SURFIX`)
- [ ] Policy name matches an existing `[Proxy Group]` entry exactly
- [ ] New rules in correct numbered section (not at EOF)
- [ ] `extended-matching` flag on RULE-SET lines in Surge conf
- [ ] No duplicate rules across `private/*.list` files
- [ ] URLs accessible (test with curl if uncertain)
- [ ] For modules: `%APPEND%`/`%INSERT%` used on `key = value` fields in `[General]`/`[MITM]`/`[WireGuard *]` (not on `[Rule]` and other list sections — those are auto-prepended)
- [ ] Clash rule-providers use correct `behavior` (classical/domain) and `format` (text/yaml)
- [ ] `no-resolve` on all IP-CIDR and IP-ASN rules

## External Rule Sources

| Source | URL Pattern | Usage |
|--------|-------------|-------|
| skk.moe | `https://ruleset.skk.moe/List/non_ip/*.conf` | Ad blocking, CDN, AI, domestic |
| blackmatrix7 | `https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/*.list` | Service-specific rules |
| AWAvenue | `https://cdn.jsdelivr.net/gh/TG-Twilight/AWAvenue-Ads-Rule@main/Filters/*` | Additional ad blocking |
| This repo | `https://fast.runapp.cc/https://raw.githubusercontent.com/conversun/SurgeRule/main/private/*.list` | Custom private rules |
