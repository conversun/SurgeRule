# 统一分流清单与配置生成

日常分流在 `routing/manifest.json` 维护一次，由本地生成器输出三端配置。
Sub-Store 继续读取根目录的配置，负责节点转换、节点注入和设备差异，不承担整份配置互转。

```text
routing/manifest.json + templates/
                    |
       node script/generate-configs.mjs
                    |
   Custom_Surge.conf / Custom_Clash.yaml / Custom_QX.conf
                    |
    发布到原仓库地址后，由 Sub-Store / 客户端拉取
                    |
       节点注入、托管配置头、SMM / Ponte 等
```

## 日常命令

在仓库中运行，无需安装依赖，要求 Node.js 18+，也可将 `node` 换成 `bun`：

```sh
node script/generate-configs.mjs
node script/generate-configs.mjs --check
bun test
git diff --check
```

第一条命令先生成并校验所有平台，再写回根目录的三个文件；不访问网络。
`--check` 只检查，不写文件；校验失败或生成文件过期时以非零状态退出。
命令从脚本位置定位仓库，不依赖当前工作目录。

回归测试使用 Bun 1.3.10，无需安装依赖。`tests/generate-configs.test.js` 验证生成一致性、
策略映射、规则顺序和错误输入；`tests/substore-scripts.test.js` 验证普通/分享/设备脚本组装。
`.github/workflows/config-check.yml` 在 push、PR 或手动触发时执行相同检查，不负责部署。

根目录的 `Custom_*` 是需要随源码一起发布的**生成产物**，不要直接编辑。
`templates/` 是生成器输入，含占位符，不能直接导入客户端或设为 Sub-Store 远程来源。

## 应该改哪里

| 需求 | 编辑位置 |
|------|----------|
| 更换规则源、调整分流顺序、指定目标策略 | `routing/manifest.json` |
| 添加自定义域名 | 已被目标客户端引用的 `private/*.list` |
| 修改 DNS、TUN、策略组成员、图标、重写、MITM | `templates/Custom_*.conf` 或 `templates/Custom_Clash.yaml` |
| 修改 Surge 模块 | `module/*.sgmodule`，仍按设备单独启用 |
| 修改订阅或节点筛选 | Sub-Store 订阅、集合及节点注入脚本 |

注意：`private/direct.list`、`proxy.list`、`reject.list`、`tunnel.list` 目前通过
Surge 自定义模块加载，并非三端都完整引用。添加域名到这些文件不会自动新增 Clash/QX 的引用。
生成器不会把含进程或逻辑规则的任意 `.list` 文件自动转换给 QX。

Shadowrocket 的白名单配置和 `ssk.conf` 参考文件不参与这次生成。

## 清单结构

`sections` 和其中的 `rules` 按顺序输出，先匹配先生效。每条规则有唯一 `id` 和逻辑 `policy`。
未指定 `platforms` 表示三端适用；段落和规则上的 `platforms` 取交集。
`disabled: ["clash"]` 表示保留该端规则但停用，Clash provider 仍生成。
`note` 用于解释例外，并输出为注释。

### 增加规则集

在对应分层的 `rules` 中插入，例如使用现有的 GitHub 策略：

```json
{
  "id": "GitHub-Extra",
  "source": "private:github-extra",
  "policy": "GitHub"
}
```

然后创建 `private/github-extra.list`，再运行生成命令。新增策略名称时，还需要在各端基础模板
中定义策略组；如果某端名称不同，在 `policyNames` 中登记映射。

规则源简写：

| `source` | 输出 |
|----------|------|
| `private:check` | 原仓库 `private/check.list`；Clash 为 classical/text；QX 启用现有资源解析器 |
| `skk:non_ip/ai` | Surge/QX 使用 `List/non_ip/ai.conf`；Clash 使用 `Clash/non_ip/ai.txt` |
| `skk:domainset/cdn` | Surge DOMAIN-SET；Clash domain/text；QX 使用资源解析器 |
| `blackmatrix7:GitHub` | 各平台原生 `GitHub/GitHub.list` 或 `.yaml` |
| `blackmatrix7:China/China_Domain` | 各平台原生 domainset 版本 |
| `url` | 用 `urls` 明确提供每个适用平台的 URL，并设置 `behavior` 为 `domain` 或 `classical` |

`url` 来源的 Clash 文件按 YAML provider 处理，QX 默认不解析；需要解析时设置 `qxParser: true`。
`qxTag` 覆盖 QX 资源标签，缺省使用 `id`。`interval` 统一设置 Clash/QX 的远程规则刷新间隔。
`clashPath` 仅用于保留已有缓存路径，一般无需设置。

### 增加单条规则

```json
{
  "id": "Example",
  "match": "DOMAIN-SUFFIX,example.com",
  "policy": "Proxy",
  "qxOrder": 25
}
```

Surge/Clash 在清单所在位置输出；QX 的单条规则全部进入 `[filter_local]`，按唯一的 `qxOrder`
升序输出，与 `[filter_remote]` 的顺序分开。不要把 QX 本地规则和远程规则理解成同一张顺序表。

`match` 不包含目标策略或末尾参数。`surgeOptions`、`clashOptions` 分别追加平台参数。
Surge 远程规则默认加 `extended-matching`；显式空数组保留原有不启用的条目。
IP-CIDR/IP-ASN 单条规则应显式加 `no-resolve`。最终规则用 `match: "FINAL"`；
生成器输出 Surge `FINAL`、Clash `MATCH`、QX `final`。

跨三端的单条规则目前支持 DOMAIN、DOMAIN-SUFFIX、DOMAIN-KEYWORD、GEOIP、FINAL。
Surge/Clash 还允许 DEST-PORT、IP-CIDR、IP-CIDR6、IP-ASN、PROCESS-NAME、AND、OR、NOT。
复杂逻辑表达式内部按原文保留，必须限制到语法兼容的平台；这不是通用语法翻译器。
不支持的顶层类型会报错，不会静默删除。远程 `.list` 的内部兼容性仍由规则源和客户端负责。

## 本次保留的平台差异

- Surge 的广告拦截和自定义覆盖继续由模块处理，不重复插入主配置。
- Clash 的 6 条广告拦截及 IP-Reject 保持停用；原有非 CN UDP/443 拦截保持原样。
- QX 仍用 skk global/domestic，且 global 在国内规则之前；Surge/Clash 仍用 blackmatrix7。
- QX 未新增原本没有的 DMM、Google 专用策略或邮件端口规则。
- Surge LAN 仍使用内置 `RULE-SET,LAN`；另两端保持各自远程 LAN 规则集。
- QX 的 GIA/Alibaba ASN 资源引用及资源解析器参数原样保留；本次不证明 QX 已支持其内部 ASN 规则。
- Surge `smart`、Clash `url-test`、QX `static` 保留各自行为，不做等价转换。

## 校验范围

生成器检查未知字段、平台名、规则 ID、目标策略是否存在、URL 形式、支持的单条规则类型、
重复输出行、QX 本地顺序、模板占位符，以及唯一且位于末尾的最终规则。
这不替代代理客户端的完整语法校验，也不检查网络可达性或远程规则集内容。

迁移时应比较去除注释后的规则和顺序，并比较 Clash provider 的 URL、behavior、format、
path、interval，不能只比较规则数量。基础模板中未涉及路由的部分应保持原样。

## Sub-Store 衔接与待部署修正

现有远程文件继续指向根目录的 `Custom_Surge.conf`、`Custom_Clash.yaml`，
不需要改下载地址或 `produceArtifact()` 调用。发布生成文件后，刷新 Sub-Store 文件即可。
当前服务器未配置 QX 生成文件；QX 使用现有客户端订阅方式即可，无须为此次生成新增服务器文件。

服务器尚未更新。两个旧问题的修正已准备在公共脚本中：

1. `script/clash_proxy.js` 用 YAML 解析代替占位符正则，普通/分享版通过 `COLLECTION` 区分；
   `Custom-Clash-Share` 必须使用 `share-temp`。
2. `script/surge-file.js` 共用三份 Surge 文件的注入逻辑，SMM 地区策略只引用当前模板真实存在的组；
   托管 URL、集合、SMM 开关和 Ponte 规则由参数提供。

部署参数矩阵、私有值迁移、逐文件验收和回滚步骤见
[Sub-Store 公共脚本部署](substore-deployment.md)。不要将订阅凭据或私有 DNS 参数复制到公共仓库。
