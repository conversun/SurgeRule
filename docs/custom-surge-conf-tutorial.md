# Surge 配置教程：`Custom_Surge.conf` 深度解读

## 一、整体架构：主配置 + 模块

本配置采用 **"精简主配置 + 功能模块"** 的架构设计。核心思路：

```
Custom_Surge.conf          ← 主配置：路由分流逻辑（哪些流量走哪个策略）
  ├── module/ad-block-*.sgmodule   ← 模块：广告拦截（按平台区分）
  ├── module/custom-rules.sgmodule ← 模块：自定义域名规则
  ├── module/private.sgmodule      ← 模块：MITM 域名
  ├── module/tailscale.sgmodule    ← 模块：Tailscale DNS 映射
  └── module/...                   ← 其他功能模块
```

**为什么广告拦截不在主配置里？** 因为 iOS 和 macOS 需要不同的拦截策略（后文详述），模块化可以按设备选择性启用，而主配置保持平台无关。

---

## 二、`[General]` 基础设置

### DNS 配置

```ini
dns-server = system,119.29.29.29,223.5.5.5
```

使用系统 DNS + 腾讯 DNSPod + 阿里 DNS 作为解析服务器，均为国内公共 DNS，解析国内域名速度最佳。

```ini
hijack-dns = 8.8.8.8:53,8.8.4.4:53,1.1.1.1:53,1.0.0.1:53
```

劫持发往 Google DNS 和 Cloudflare DNS 的请求，由 Surge 统一处理，避免 DNS 泄露。

```ini
always-real-ip = *.srv.nintendo.net, *.stun.playstation.net, stun.*, ...
```

对于游戏、视频通话等需要真实 IP 的场景，跳过 Surge 的 Fake IP 机制，直接返回真实解析结果。

### GeoIP 数据库

```ini
geoip-maxmind-url = https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country-only-cn-private.mmdb
```

使用 Loyalsoldier 维护的精简版 GeoIP 数据库（仅中国 + 内网），体积小、更新频繁。配合末尾的 `GEOIP,CN,DIRECT` 规则，实现兜底的国内直连判断。

### 跳过代理

```ini
skip-proxy = 127.0.0.0/8, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, ...
```

内网地址、Tailscale 网段（`100.64.0.0/10`）、以及部分特定银行/运营商域名直接绕过代理，避免内网服务异常。

### 连通性测试

```ini
internet-test-url = http://wifi.vivo.com.cn/generate_204
proxy-test-url = http://cp.cloudflare.com/generate_204
test-timeout = 3
```

- `internet-test-url`：检测本机是否有网络连接（国内网站，响应快）
- `proxy-test-url`：检测代理节点是否通畅（Cloudflare，全球 CDN）
- 3 秒超时，快速淘汰慢节点

### 网络共享

```ini
http-listen = 0.0.0.0:8888
socks5-listen = 0.0.0.0:8889
allow-wifi-access = true
```

开放 HTTP/SOCKS5 代理端口，允许同一 Wi-Fi 下的其他设备（如不支持 Surge 的设备）通过本机代理上网。

### QUIC 阻断

```ini
block-quic = all-proxy
```

阻断所有需要走代理的 QUIC 流量，强制回落到 TCP。原因：QUIC 基于 UDP，多数代理协议对 UDP 支持不佳或不经过规则引擎，阻断后可确保流量被正确路由和审查。

---

## 三、`[Proxy Group]` 策略组设计

### 主策略

```ini
Proxy = select,🇭🇰 HK,🇼🇸 TW,🇸🇬 SG,🇺🇲 US,🇯🇵 JP
```

手动选择出口地区的总入口。所有需要代理的流量如果没有特定策略，最终走这里。

### 服务策略（可独立控制出口）

```
AI / Media / TikTok / Apple / GitHub / Telegram / Tunnel
```

每个服务都可以独立选择 `Proxy`（跟随主策略）、`DIRECT`（直连）或指定地区。例如：

- `AI` → 选 `🇺🇲 US`，因为 Claude/OpenAI 通常需要美国节点
- `TikTok` → 选不同地区可以看不同地区内容
- `Telegram` → 可选就近节点降低延迟

### 金融策略

```
Crypto / PayPal / Stripe
```

金融服务单独隔离，避免频繁切换节点触发风控。

### 地区节点组

```ini
🇭🇰 HK = smart, include-all-proxies=1, policy-regex-filter=(?!.*(Game))(港|Hong|HK), interval=600, timeout=2, evaluate-before-use=true
```

- `smart`：自动选择延迟最低的节点
- `include-all-proxies=1`：包含所有订阅中的节点
- `policy-regex-filter`：用正则匹配节点名中的地区关键词，同时排除 Game 专用节点（`(?!.*(Game))`）
- `evaluate-before-use=true`：使用前先测速，避免选中已失效节点

---

## 四、`[Rule]` 规则分层——优先级是核心

Surge 规则采用 **"先匹配先生效"** 原则，顺序至关重要。本配置分为 10 个逻辑层：

```
 优先级高 ↑
 ┌─────────────────────────────────────┐
 │ (Module pre-matching: 广告拦截)     │  ← 模块注入，最先执行
 ├─────────────────────────────────────┤
 │ 1. 国内直连  (Apple CDN, 国内媒体)  │  ← 国内服务快速放行
 │ 2. AI       (Claude, OpenAI 等)    │
 │ 3. 流媒体    (Netflix, YouTube)     │
 │ 4. 服务      (GitHub, Telegram)     │
 │ 5. 金融      (Crypto, PayPal)       │
 │ 6. 工具      (Speedtest)            │
 │ 7. CDN & 下载                       │
 │ 8. 国内域名   (China 全量列表)       │
 │ 9. IP 规则    (Telegram IP, 广告 IP) │
 │10. 兜底       (GEOIP CN, FINAL)     │
 ├─────────────────────────────────────┤
 │ (Module: custom-rules 自定义规则)    │  ← 模块注入的普通规则
 └─────────────────────────────────────┘
 优先级低 ↓
```

### 设计逻辑

1. **国内直连最先**：Apple/Microsoft CDN、国内媒体等高频流量立即放行，减少不必要的规则匹配
2. **服务分流在中间**：AI、流媒体、金融等需要指定出口的服务精确匹配
3. **CDN 和下载统一走代理**：海外 CDN 和软件下载通常需要代理加速
4. **国内域名兜底**：使用 blackmatrix7 的 `China_All_No_Resolve` 大规则集，覆盖绝大多数国内域名
5. **IP 兜底**：`GEOIP,CN,DIRECT` 确保没匹配到域名规则的国内 IP 仍然直连
6. **FINAL 兜底**：所有未匹配的流量走 `Proxy`，`dns-failed` 表示 DNS 解析失败的也走代理（防止被污染的域名无法访问）

### 关键规则说明

```ini
PROCESS-NAME,Telegram,REJECT-DROP
```

这条规则位于 `RULE-SET,https://...telegram.conf,Telegram`（IP 规则）之后。作用：Telegram 的 IP 段流量已被 IP 规则集捕获并走 `Telegram` 策略；如果有任何漏网的 Telegram 进程流量（如直连尝试），直接丢弃，防止真实 IP 泄露。

```ini
FINAL,Proxy,dns-failed
```

终极兜底：所有未被任何规则匹配的流量走代理。`dns-failed` 参数表示 DNS 解析失败时也交给代理处理（由远端 DNS 解析），这对于被 DNS 污染的域名至关重要。

---

## 五、广告拦截模块——与主配置的配合

**这是本配置最重要的设计之一：广告拦截完全剥离到模块中。**

### 为什么要分离？

iOS 和 macOS 在处理被拦截请求时的表现不同：

| 平台 | 拦截策略 | 原因 |
|------|---------|------|
| iOS | `REJECT-DROP` | 静默丢弃，不返回任何响应。省电（设备不需要处理响应），适合移动端 |
| macOS | `REJECT` | 返回一个空响应。如果用 `REJECT-DROP`，浏览器会一直等待响应直到超时，页面出现 loading 卡顿 |
| macOS Lite | `REJECT` | 精简版，仅保留核心广告域名规则，减少规则数量 |

### 三个广告模块对比

**`ad-block-ios.sgmodule`**（iOS 完整版）：

```ini
RULE-SET,.../sogouinput.conf,REJECT-DROP          # 搜狗输入法遥测
DOMAIN-SET,.../reject.conf,REJECT-DROP,pre-matching  # 广告域名集
RULE-SET,.../reject.conf,REJECT-DROP,pre-matching    # 广告规则集
RULE-SET,.../reject-no-drop.conf,REJECT-NO-DROP      # 不能丢弃的拦截（如需返回空响应的 API）
RULE-SET,.../reject-drop.conf,REJECT-DROP            # 可丢弃的拦截
RULE-SET,...AWAvenue-Ads-Rule...,REJECT-DROP,pre-matching  # 秋风广告规则
```

**`ad-block-mac.sgmodule`**（macOS 完整版）：

```ini
# 结构相同，但全部使用 REJECT 而非 REJECT-DROP
DOMAIN-SET,.../reject.conf,REJECT                    # 注意：没有 pre-matching
RULE-SET,.../reject.conf,REJECT
...
```

**`ad-block-mac-lite.sgmodule`**（macOS 精简版）：

```ini
# 仅保留两条核心规则
DOMAIN-SET,.../reject.conf,REJECT
RULE-SET,.../reject.conf,REJECT
```

### `pre-matching` 的关键作用

带有 `pre-matching` 标记的规则会在 **所有主配置规则之前** 被评估。这意味着：

```
请求进入 Surge
  ↓
① pre-matching 规则（模块中的广告拦截）  ← 广告在这里就被杀死
  ↓ （未命中）
② 主配置 [Rule] 按顺序匹配              ← 正常流量在这里分流
  ↓ （未命中）
③ 模块中的非 pre-matching 规则
  ↓ （未命中）
④ FINAL 兜底
```

**为什么广告拦截要 pre-matching？**

- 广告请求不需要进入路由分流逻辑，越早拦截越省资源
- 避免广告域名意外命中其他规则（如某广告 CDN 域名被 CDN 规则集匹配走了代理）
- 性能优化：Surge 对 `pre-matching` 规则使用优化的数据结构，匹配速度更快

### 规则源

| 来源 | 内容 | 规模 |
|------|------|------|
| `ruleset.skk.moe` (Sukka) | 广告域名、隐私追踪、恶意软件、钓鱼 | 数万条，高质量维护 |
| `AWAvenue-Ads-Rule` (秋风) | 中国区特色广告规则 | 国内 App 广告覆盖好 |

两者互补：Sukka 的规则偏国际化和全面，秋风的规则专注国内 App 和网站广告。

---

## 六、`custom-rules.sgmodule` 自定义规则模块

自定义规则同样以模块形式加载，引用 `private/` 目录下的规则列表：

```ini
RULE-SET,.../private/direct.list,DIRECT     # 自定义直连
RULE-SET,.../private/proxy.list,Proxy       # 自定义代理
RULE-SET,.../private/ssh.list,Tunnel        # SSH 端口走 Tunnel 策略
```

### 各列表用途

| 文件 | 用途 | 典型内容 |
|------|------|---------|
| `reject.list` | 拦截特定软件的联网 | Parallels 许可证验证域名 |
| `direct.list` | 强制直连 | Plex、NAS、微信/飞书进程、国内 SSH |
| `proxy.list` | 强制代理 | Plex 远程、Google 广告平台（做广告投放用）、Apple 部分服务 |
| `ai.list` | AI 服务 | Claude 域名和进程 |
| `ssh.list` | SSH 流量 | `DEST-PORT,22` 走 Tunnel 策略 |
| `tail.list` | Tailscale 网段 | `100.64.0.0/10`、WireGuard 内网 |
| `apple.list` | Apple 特定域名 | iTunes、广告归因 API |

---

## 七、`[Host]` DNS 分流

```ini
# 公司分流 DNS
RULE-SET:.../alibaba.conf = server:223.5.5.5      # 阿里 → 阿里 DNS
RULE-SET:.../tencent.conf = server:119.29.29.29    # 腾讯 → DNSPod
RULE-SET:.../bytedance.conf = server:180.184.2.2   # 字节 → 火山 DNS
RULE-SET:.../baidu.conf = server:180.76.76.76      # 百度 → 百度 DNS
```

**为什么要这样做？** 国内大厂通常在自家 DNS 上部署了 CDN 调度逻辑。用阿里 DNS 解析阿里域名，能被调度到最近的 CDN 节点，延迟更低、速度更快。用错 DNS 可能被调度到远端节点。

```ini
# 局域网 → 系统 DNS
*.local = server:system
*.ts.net = server:system
```

内网域名和 Tailscale 域名交给系统 DNS（通常是路由器或 Tailscale 的 MagicDNS），确保内网解析正常。

---

## 八、`[MITM]` HTTPS 解密

```ini
skip-server-cert-verify = true
h2 = true
hostname-disabled = gateway.icloud.com, ..., weather-data.apple.com, buy.itunes.apple.com
```

- `h2 = true`：启用 HTTP/2 协议的 MITM，确保现代网站的请求能被正确解密和分析
- `hostname-disabled`：列出 **不进行** MITM 的域名。iCloud 网关、天气数据、iTunes 购买等敏感服务跳过解密，避免证书绑定（Certificate Pinning）导致连接失败
- 其他模块（如 `private.sgmodule`）通过 `%APPEND%` 追加需要解密的域名

---

## 九、模块系统工作原理

### `%APPEND%` 与 `%INSERT%`

模块中的配置通过指令注入主配置：

```ini
# private.sgmodule
[MITM]
hostname = %APPEND% *.local, *.instagram.com, ...
```

- `%APPEND%`：追加到主配置对应字段的末尾
- `%INSERT%`：插入到主配置对应字段的开头

**重要**：如果不使用这些指令而直接赋值（`hostname = foo.com`），会 **覆盖** 主配置的值，导致其他域名的 MITM 失效。

### 模块加载顺序

在 Surge 中，模块的 `[Rule]` 会按加载顺序插入到主配置规则之后（除非标记了 `pre-matching`）。因此：

1. 广告拦截模块的 `pre-matching` 规则 → **最高优先级**
2. 主配置 `[Rule]` 中的规则 → **按配置文件中的顺序**
3. 模块中的非 `pre-matching` 规则 → **在主配置之后**

### 推荐的模块启用组合

**iOS 设备：**

- ✅ `ad-block-ios.sgmodule` — 完整广告拦截
- ✅ `custom-rules.sgmodule` — 自定义分流
- ✅ `private.sgmodule` — MITM 域名

**macOS 设备：**

- ✅ `ad-block-mac.sgmodule` 或 `ad-block-mac-lite.sgmodule` — 按需选择
- ✅ `custom-rules.sgmodule` — 自定义分流
- ✅ `private.sgmodule` — MITM 域名
- ✅ `hide-qbittorrent.sgmodule` — 隐藏 BT 流量（如需要）
- ✅ `tailscale.sgmodule` — Tailscale 设备映射（如使用 Tailscale）

---

## 十、请求的完整生命周期

一个域名请求从进入 Surge 到最终被处理的完整流程：

```
用户请求 api.anthropic.com
  │
  ├─ skip-proxy 检查 → 不在列表中，继续
  │
  ├─ [Host] DNS 分流 → 无匹配，使用默认 DNS
  │
  ├─ pre-matching 规则（广告模块）→ 不是广告域名，继续
  │
  ├─ [Rule] 主配置规则按顺序匹配：
  │   ├─ 1. 国内直连？→ 不匹配
  │   ├─ 2. AI？→ skk.moe/ai.conf 命中！→ 策略 = AI
  │   └─ (后续规则不再评估)
  │
  ├─ AI 策略组当前选择 → 🇺🇲 US
  │
  ├─ 🇺🇲 US smart 策略 → 自动测速选最快的美国节点
  │
  └─ 通过选中的代理节点发出请求
```

---

## 十一、维护指南

### 添加新域名到现有策略

直接编辑 `private/` 下对应的 `.list` 文件，push 到 GitHub 即可。Surge 会在下次更新规则集时自动拉取。

### 添加全新服务策略

1. 在 `[Proxy Group]` 中添加新策略组
2. 在 `[Rule]` 的对应编号区域添加 `RULE-SET`
3. 如有专用域名列表，创建 `private/servicename.list` 并在 `custom-rules.sgmodule` 中引用

### 外部规则集更新

本配置依赖的外部规则集均通过 CDN URL 引用，由上游维护者更新。Surge 会定期自动刷新。主要来源：

- **[Sukka (skk.moe)](https://blog.skk.moe/post/i-have-my-unique-surge-setup/)**：广告拦截、CDN、AI、国内域名等
- **[blackmatrix7](https://github.com/blackmatrix7/ios_rule_script)**：各服务专用规则（Netflix、GitHub、Telegram 等）
- **[AWAvenue](https://github.com/TG-Twilight/AWAvenue-Ads-Rule)**：国内广告规则补充
