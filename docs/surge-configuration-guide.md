# Surge 官方配置完整指南

> 适用版本：Surge iOS 5.x / Surge Mac 5.x-6.x | 来源：`manual.nssurge.com`

---

## 一、配置文件结构

Surge 配置文件采用 INI 风格，由以下主要段落组成：

```
[General]        # 全局参数
[Proxy]          # 代理策略定义
[Proxy Group]    # 策略组
[Rule]           # 路由规则（顺序敏感，首条匹配生效）
[Host]           # 本地 DNS 映射
[URL Rewrite]    # URL 重写
[Header Rewrite] # HTTP 头重写
[Body Rewrite]   # HTTP Body 重写
[Script]         # JavaScript 脚本
[MITM]           # HTTPS 解密
[WireGuard xxx]  # WireGuard VPN 配置段
[Keystore]       # 客户端证书存储
```

---

## 二、`[General]` 全局参数

### 核心网络参数

| 参数 | 说明 |
|------|------|
| `loglevel` | 日志级别：`verbose` / `info` / `notify` / `warning` |
| `ipv6 = true` | 启用完整 IPv6 支持，查询 AAAA 记录 |
| `dns-server` | 上游 DNS 服务器 IP |
| `encrypted-dns-server` | 加密 DNS（支持 DoH `https://`、DoH3 `h3://`、DoQ `quic://`） |
| `encrypted-dns-follow-outbound-mode` | 加密 DNS 查询跟随出站模式/规则 |
| `skip-proxy` | 跳过代理的域名/IP 列表 |
| `internet-test-url` | 网络连通性测试 URL（也作为 DIRECT 策略测试 URL） |
| `proxy-test-url` | 代理策略默认测试 URL |
| `test-timeout` | 连通性测试超时时间 |

### DNS 相关

| 参数 | 说明 |
|------|------|
| `always-real-ip` | 指定域名返回真实 IP 而非 Fake IP |
| `hijack-dns` | 劫持其他 DNS 查询（如 `*:53` 劫持所有） |
| `allow-dns-svcb` | 允许 SVCB 记录查询（默认关闭以确保 Fake IP 生效） |

### VIF / 增强模式

| 参数 | 说明 |
|------|------|
| `ipv6-vif` | IPv6 VIF 模式：`off` / `auto` / `always` |
| `tun-excluded-routes` | VIF 排除的 IP 段 |
| `tun-included-routes` | VIF 包含的小路由 |
| `always-raw-tcp-hosts` | 跳过协议嗅探的主机列表 |

### QUIC 控制（5.14.6+）

```
block-quic = per-policy   # 默认，按策略决定
block-quic = all-proxy    # 代理策略全部阻止 QUIC
block-quic = all          # 包括 DIRECT 全部阻止
block-quic = always-allow # 全部允许
```

### UDP 行为（Mac 6.0.0+）

```
udp-policy-not-supported-behaviour = REJECT  # 不支持 UDP 的策略时行为，默认 REJECT（避免泄漏）
```

### iOS 专属参数

| 参数 | 说明 |
|------|------|
| `allow-wifi-access` | 允许 LAN 设备访问代理服务 |
| `wifi-assist` | Wi-Fi 辅助 |
| `all-hybrid` | 同时使用 Wi-Fi 和蜂窝数据 |
| `include-all-networks` | 接管所有网络流量（防泄漏，iOS 14+） |
| `include-local-networks` | 接管局域网流量（iOS 14.2+） |
| `compatibility-mode` | 工作模式：`0`(自动) / `1` / `2` / `3`(VIF only，默认) / `4` / `5` |
| `hide-vpn-icon` | 隐藏状态栏 VPN 图标 |

### Mac 专属参数

| 参数 | 说明 |
|------|------|
| `http-listen` | HTTP 代理监听地址（如 `0.0.0.0:6152`） |
| `socks5-listen` | SOCKS5 代理监听地址 |
| `read-etc-hosts` | 读取 `/etc/hosts` |

---

## 三、`[Proxy]` 代理策略

### 支持的协议类型

| 协议 | 示例 |
|------|------|
| **HTTP** | `http, 1.2.3.4, 443, user, pass` |
| **HTTPS** | `https, 1.2.3.4, 443, user, pass` |
| **SOCKS5** | `socks5, 1.2.3.4, 443, user, pass` |
| **SOCKS5-TLS** | `socks5-tls, 1.2.3.4, 443, user, pass` |
| **Shadowsocks** | `ss, 1.2.3.4, 8000, encrypt-method=chacha20-ietf-poly1305, password=xxx` |
| **VMess** | `vmess, 1.2.3.4, 8000, username=uuid` |
| **Trojan** | `trojan, 1.2.3.4, 443, password=xxx` |
| **Snell v4/v5** | `snell, 1.2.3.4, 8000, psk=xxx, version=4` |
| **TUIC** | `tuic, 1.2.3.4, 443, token=xxx, alpn=h3` |
| **Hysteria 2** *(5.8.0+)* | `hysteria2, 1.2.3.4, 443, password=xxx, download-bandwidth=100` |
| **WireGuard** | `wireguard, section-name=xxx`（需配合 `[WireGuard xxx]` 段） |
| **SSH** | 通过 SSH 隧道转发 |
| **AnyTLS** *(5.17.0+)* | `anytls, 1.2.3.4, 443, password=xxx` |

### 通用 TLS 参数

- `skip-cert-verify` -- 跳过证书验证
- `sni` -- 自定义 SNI（`sni=off` 关闭）
- `server-cert-fingerprint-sha256` -- 证书指纹固定

### 高级特性

- **代理链**：`underlying-proxy=ProxyA`（通过一个代理连接另一个代理）
- **Shadow TLS v2/v3**：`shadow-tls-password=xxx, shadow-tls-version=3`
- **端口跳跃** (TUIC/Hysteria2)：`port-hopping=1234;5000-6000, port-hopping-interval=30`
- **UDP 中继**：Snell v4/v5, SS, Trojan, WireGuard, Hysteria 2, TUIC 支持（SS/SOCKS5 需手动 `udp-relay=true`）

### 通用策略参数

| 参数 | 说明 |
|------|------|
| `interface=en2` | 强制使用指定出口网卡 |
| `allow-other-interface=true` | 指定网卡不可用时回退默认网卡 |
| `ip-version` | `dual` / `v4-only` / `v6-only` / `prefer-v4` / `prefer-v6` |
| `hybrid=true` | Wi-Fi + 蜂窝同时建连（iOS 专属） |
| `tfo=true` | TCP Fast Open |
| `ecn=true` | ECN 支持（5.8.0+） |
| `block-quic` | `auto` / `on` / `off` |
| `test-url` | 覆盖全局测试 URL |

---

## 四、`[Proxy Group]` 策略组

| 类型 | 说明 |
|------|------|
| **select** | 手动选择 |
| **url-test** | 自动测速选最快 |
| **fallback** | 自动选第一个可用 |
| **load-balance** | 负载均衡 |
| **subnet** | 根据子网表达式选择 |

支持 **Policy Including**，允许从外部策略提供者导入策略到策略组。

---

## 五、`[Rule]` 路由规则

**规则从上到下逐条匹配，首条命中即停止。必须以 `FINAL` 结尾。**

### 规则类型一览

| 类别 | 规则类型 |
|------|---------|
| **域名** | `DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` / `DOMAIN-WILDCARD` / `DOMAIN-SET` |
| **IP** | `IP-CIDR` / `IP-CIDR6` / `GEOIP` / `IP-ASN` |
| **HTTP** | `USER-AGENT` / `URL-REGEX` / `HEADER` |
| **进程** (Mac) | `PROCESS-NAME` / `PROCESS-BUNDLE-ID` |
| **逻辑组合** | `AND` / `OR` / `NOT`（可嵌套） |
| **子网** | `SUBNET`（匹配 SSID/BSSID/ROUTER/TYPE） |
| **端口** | `DEST-PORT` / `SRC-PORT` / `SRC-IP` |
| **协议** | `PROTOCOL`（`DOH` / `DOH3` / `DOQ` 等） |
| **外部** | `RULE-SET`（远程规则集） |
| **兜底** | `FINAL` |

### 逻辑规则示例

```
AND,((SRC-IP,192.168.1.110), (DOMAIN, example.com)),DIRECT
OR,((DOMAIN,a.com), (DOMAIN,b.com)),Proxy
NOT,((GEOIP,CN)),Proxy
```

### 子网规则示例

```
SUBNET,SSID:MyHome,DIRECT
SUBNET,TYPE:CELLULAR,Proxy
SUBNET,TYPE:WIRED,DIRECT
```

### Pre-matching 预匹配（5.14.0+）

在 DNS/TCP SYN 阶段即快速拦截，极低开销：

```
DOMAIN,ad.com,REJECT,pre-matching
```

---

## 六、内置策略

| 策略 | 行为 |
|------|------|
| `DIRECT` | 直连 |
| `REJECT` | 拒绝，HTTP 返回错误页 |
| `REJECT-DROP` | 静默丢弃（避免重试风暴） |
| `REJECT-NO-DROP` | 拒绝但不自动升级为 DROP |
| `REJECT-TINYGIF` | 返回 1px 透明 GIF（广告占位） |

---

## 七、DNS 配置

### `[Host]` 本地 DNS 映射

```
[Host]
abc.com = 1.2.3.4                          # 域名映射到 IP
*.dev = 6.7.8.9                            # 通配符
example.com = server:https://dns.google/dns-query  # 指定域名使用加密 DNS
```

### 加密 DNS

```
[General]
encrypted-dns-server = https://8.8.8.8/dns-query, h3://dns.google/dns-query, quic://dns.adguard.com
```

支持 **DNS over HTTPS** / **DNS over HTTP/3** / **DNS over QUIC** 三种协议。

---

## 八、HTTP 处理

### URL Rewrite（`[URL Rewrite]`）

```
^http://www\.google\.cn http://www.google.com header     # 修改请求头重定向
^http://yachen\.com https://yach.me 302                   # 302 重定向
^http://ad\.com/ad\.png _ reject                          # 拒绝请求
```

### Header Rewrite（`[Header Rewrite]`）

修改 HTTP 请求/响应头。

### Body Rewrite（`[Body Rewrite]`）（5.10.0+）

```
http-response ^https?://example\.com/ oldText newText
```

支持 **JQ 表达式** 处理 JSON Body（5.14.0+）：

```
http-response-jq ^http://api.com/data '.items |= map(select(.active))'
```

### Mock / Map Local（`[Map Local]`）

将请求映射到本地文件或内联数据。

---

## 九、`[MITM]` HTTPS 解密

```
[MITM]
ca-p12 = MIIJtQ...          # Base64 编码的 P12 证书
ca-passphrase = password     # 证书密码
hostname = -*.apple.com, -*.icloud.com, *   # 解密域名列表（- 排除）
h2 = true                   # HTTP/2 MitM
```

| 参数 | 说明 |
|------|------|
| `skip-server-cert-verify` | 不验证远端证书 |
| `h2` | 启用 HTTP/2 MitM（提升并发性能） |
| `client-source-address` | 仅对指定设备启用 MitM（支持 IP/CIDR/MAC） |
| `auto-quic-block = true` | 命中 MitM 域名时自动阻止 QUIC 回退到 HTTP/2（5.8.0+） |

---

## 十、`[Script]` JavaScript 脚本

### 脚本类型

| 类型 | 用途 |
|------|------|
| `http-request` | 修改 HTTP 请求 |
| `http-response` | 修改 HTTP 响应 |
| `cron` | 定时任务 |
| `event` | 事件触发 |
| `dns` | DNS 查询拦截 |
| `rule` | 规则匹配脚本 |
| `generic` | 通用脚本 |

### 示例

```
[Script]
rewrite = type=http-response, pattern=^https://api\.example\.com, script-path=modify.js, requires-body=true, max-size=131072
cron-job = type=cron, cronexp="0 9 * * *", script-path=morning.js
```

### 脚本引擎（5.9.0+）

- **JSC**（`engine=jsc`）：低延迟，适合简单高频脚本
- **WebView**（`engine=webview`）：独立进程，支持 JIT、WebAPI，适合复杂脚本

### 核心 API

- `$httpClient.get/post/put/delete()` -- HTTP 请求
- `$persistentStore.read/write()` -- 持久化存储
- `$notification.post()` -- 推送通知
- `$httpAPI()` -- 调用 Surge HTTP API
- `$utils.geoip()` / `$utils.ipasn()` -- GeoIP/ASN 查询
- `$done()` -- 必须调用表示脚本完成

---

## 十一、WireGuard 配置

```
[Proxy]
wg-home = wireguard, section-name = HomeServer

[WireGuard HomeServer]
private-key = sDEZLACT3zgNCS0CyClgcBC2eYROqYrwLT4wdtAJj3s=
self-ip = 10.0.2.2
self-ip-v6 = fd00:1111::11
dns-server = 8.8.8.8
prefer-ipv6 = false
mtu = 1280
peer = (public-key = fWO8XS9/nwUQcqnkfBpKeqIqbzclQ6EKP20Pgvzwclg=, allowed-ips = 0.0.0.0/0, endpoint = 192.168.20.6:51820)
```

支持特性：

- IPv4/IPv6 双栈
- 多 peer
- `preshared-key` / `keepalive`
- 自定义 Reserved Bits（如 Cloudflare WARP `client-id`）
- ECN 标记透传（5.8.0+）

---

## 十二、Module 模块系统（`.sgmodule`）

模块是对当前配置的"补丁"，优先级高于主配置。

### 模块类型

- **内置模块** -- Surge 自带
- **本地模块** -- 配置目录中的 `.sgmodule` 文件
- **远程模块** -- 通过 URL 安装

### 模块语法

```
#!name=Module Name
#!desc=Description
#!system=mac                    # 可选，限制平台
#!requirement=CORE_VERSION>=20  # 可选，版本要求（5.10.0+）
#!arguments=hostname=example.com&enable=true  # 参数表（Mac 5.5.0+）

[General]
always-real-ip = %APPEND% *.nintendo.net   # 追加到现有值
always-real-ip = %INSERT% *.priority.com   # 插入到开头

[Rule]
DOMAIN,blocked.com,REJECT       # 模块中的规则只能使用 DIRECT/REJECT/REJECT-TINYGIF

[MITM]
hostname = %APPEND% *.example.com

[Script]
...
```

### 可覆盖的段落

- `[General]` / `[MITM]` -- 支持 `%APPEND%` 和 `%INSERT%`
- `[WireGuard *]` / `[Ruleset *]` -- 可覆盖或追加
- `[Rule]` / `[Script]` / `[URL Rewrite]` / `[Header Rewrite]` / `[Host]` -- 新行插入到原内容顶部

### 参数表变量替换

定义 `#!arguments=SERVER=example.com`，配置中使用 `%SERVER%` 占位符，用户安装时可自定义值。

### 版本要求表达式

```
#!requirement=CORE_VERSION>=20 && (SYSTEM = 'iOS' || SYSTEM = 'tvOS')
```

可用变量：`CORE_VERSION`、`SYSTEM`、`SYSTEM_VERSION`、`DEVICE_MODEL`、`LANGUAGE`

---

## 十三、其他重要功能

### HTTP API

```
[General]
http-api = key@0.0.0.0:6166
http-api-web-dashboard = true   # 浏览器控制面板
http-api-tls = true             # 使用 HTTPS
```

### 端口转发

支持将本地端口转发到远程地址，通过配置实现。

### 子网设置（`[SSID Setting]`）

根据不同网络环境切换配置参数。

### URL Scheme

支持 `surge://` URL Scheme 进行自动化操作。

### Surge Mac CLI

命令行工具控制 Surge Mac。

---

## 十四、版本演进重点特性

| 版本 | 特性 |
|------|------|
| **5.8.0+** | Hysteria 2、ECN 支持、`block-quic` 全局控制、`auto-quic-block` |
| **5.10.0+** | Body Rewrite、模块 `#!requirement` |
| **5.14.0+** | Pre-matching REJECT、JQ Body Rewrite |
| **5.17.0+ / Mac 6.4.3+** | AnyTLS v2 协议 |
| **Mac 5.5.0+** | 模块参数表 `#!arguments` |
| **Mac 6.0.0+** | `udp-policy-not-supported-behaviour` 默认改为 REJECT |

---

**官方文档**：https://manual.nssurge.com/
**理解 Surge 指南**：https://manual.nssurge.com/book/understanding-surge/cn/
