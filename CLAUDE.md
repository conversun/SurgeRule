# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a Surge proxy configuration repository containing rule sets for network traffic routing. Surge is a network debugging and proxy tool commonly used on iOS/macOS.

## Repository Structure

The repository contains the following file types:

- **`.conf` files**: Main Surge configuration files (Custom.conf, ssk.conf)
- **`.list` files**: Rule lists defining which domains/IPs should use specific routing
  - `proxy.list`: Domains that should go through proxy
  - `direct.list`: Domains that should bypass proxy (direct connection)
  - `reject.list`: Domains that should be blocked
  - `apple.list`: Apple service domains
  - Additional service-specific lists (cmb.list, smm.list, ssh.list, stripe.list)
- **`.sgmodule` files**: Surge modules for specific functionality (lg.sgmodule, private.sgmodule)

## Rule List Format

Rule lists follow Surge's rule syntax:
- `DOMAIN,example.com` - Exact domain match
- `DOMAIN-SUFFIX,example.com` - Match domain and all subdomains
- `PROCESS-NAME,AppName` - Match by application process name
- `AND,((CONDITION1), (CONDITION2))` - Complex rule with multiple conditions
- `GEOIP,CN` - Match by geographical IP location
- `DEST-PORT,22` - Match by destination port

## Common Tasks

### Adding New Rules
When adding new domains to rule lists:
1. Use `DOMAIN-SUFFIX` for services that use multiple subdomains
2. Use `DOMAIN` for exact domain matches
3. Keep entries sorted alphabetically within each section
4. Leave blank lines between logical groups

### Updating Configuration
The main configuration file (`Custom.conf`) contains:
- DNS settings
- Proxy groups
- Network bypass rules
- API endpoints for Surge dashboard

### Module Files
`.sgmodule` files use Surge's module format with metadata:
```
#!name=Module Name
#!desc=Module Description
#!category=Category

[Section]
configuration
```

## Surge v6 New Features

The configuration has been updated to support Surge v6 features:
- **DoH3 Support**: Using `h3://` prefix for encrypted DNS servers
- **IPv6 Support**: Full IPv6 configuration with `ipv6-vif` auto mode
- **Enhanced Proxy Groups**: Smart groups with `evaluate-before-use` for better performance
- **New Rule Types**: Support for ASN, MAC-ADDRESS, SUBNET, and logical operators (AND, OR, NOT)
- **Network Framework**: Native network framework integration for better performance
- **UDP Proxy Testing**: Added `proxy-test-udp` for UDP connectivity testing
- **HTTP/2 & QUIC**: Full HTTP/2 support with MITM and QUIC traffic handling

## Important Considerations

- Rule order matters in Surge - more specific rules should come before general ones
- The repository tracks personal/private proxy configurations - be cautious with sensitive data
- Changes to `.conf` files require Surge to reload configuration
- Test rule changes carefully as they affect network routing
- Surge v6 features require the latest version of Surge for full compatibility