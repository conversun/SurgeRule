# Sub-Store 公共脚本部署

本文件是待执行步骤，不代表服务器已更新。仓库检查只读确认过配置，未写入服务器。
发布仓库和更新服务器需另外确认；先在 Sub-Store 文件预览中验收，再让客户端刷新。

## 公共脚本与参数

脚本通过 Sub-Store 的文件 Script Operator 执行，读取 `$content`、`$arguments`、
`produceArtifact` 和 `ProxyUtils`，不是独立 Node.js 程序。

| 服务器文件 name | 公共脚本 | 参数 |
|----------------|----------|------|
| `CustomConf` | `script/surge-file.js` | `COLLECTION=private-proxy`，保留原 `MANAGED_URL`，`SMM=true` |
| `CustomConf-iOS` | `script/surge-file.js` | `COLLECTION=private-proxy`，保留原 `MANAGED_URL`，`PONTE_RULES` 设为原脚本的两条完整 Ponte 规则 |
| `Surge-MAC-XT` | `script/surge-file.js` | `COLLECTION=private-proxy-xt`，保留原 `MANAGED_URL` |
| `Custom-Clash` | `script/clash_proxy.js` | `COLLECTION=private-proxy`，将原脚本的私有 DNS 映射移入 `DNS_OVERRIDES` |
| `Custom-Clash-Share` | `script/clash_proxy.js` | **`COLLECTION=share-temp`**，不要使用私有集合 |

`shadowrocket-proxy` 不改；本轮也不新增 QX 服务器文件。

### Clash 参数

- `COLLECTION`：Sub-Store 集合名，默认 `private-proxy`。
- `DNS_OVERRIDES`：映射对象或 JSON 字符串，默认 `{}`。键为 `+.domain`，值为 DNS 地址。
  只为实际出现的节点域名注入 `proxy-server-nameserver-policy`；匹配根域和子域，不匹配相似后缀。
  不更改客户端查询 DNS 或直连 DNS。

示例仅用于展示参数结构，不应替换真实私有值：

```json
{
  "COLLECTION": "private-proxy",
  "DNS_OVERRIDES": {
    "+.nodes.example": "192.0.2.53:1053"
  }
}
```

脚本解析 YAML 后处理节点和策略组，不再依赖 `proxies: []` / `[DIRECT]` 的文本写法。
地区无匹配节点时使用 `DIRECT`，删除已经完成匹配的 `filter`。
节点名称由 YAML 序列化器转义，不手工拼接引号。
最终 Sub-Store 输出的注释和排版会变化，规则值、顺序和非注入字段不应变化。

### Surge 参数

- `COLLECTION`：默认 `private-proxy`。
- `MANAGED_URL`：必填，保留各文件现有的完整托管 URL，不能填公共模板地址。
- `SMM`：布尔值 `true` 或字符串 `"true"` 启用；默认关闭。
  保留原来的三个域名及 `smm` 关键词规则，策略组只引用基础模板中真实存在的自动地区组，
  不再硬编码 `🇼🇸 TW`。
- `PONTE_RULES`：默认空字符串。填原脚本的完整规则文本，多条使用实际换行。
  保留 `DEVICE:` 目标、网段及 `no-resolve`，在基础 `[Rule]` 前插入。

`MANAGED_URL`、Ponte 设备信息、私有 DNS 映射只留在服务器参数或私有备份中。
现有 iOS 文件中的 `WG_*` 参数在本次读取的脚本中没有使用；迁移时仍保留，避免顺手删除私有设置。
被忽略的 `script/surge_proxy.js` 不参与此次部署，也不要取消其忽略规则。

## 发布前

1. 运行 `node script/generate-configs.mjs --check` 和 `bun test`。
2. 审阅共享清单、基础模板、生成文件和公共脚本的差异，确认三端差异仍显式保留。
3. 经确认提交并推送仓库，等待 `Config checks` 成功。CI 只检查，不生成提交或部署。
4. 保存本次仓库版本标识。服务器脚本可引用该版本的原始文件地址，避免随 `main` 更新而提前切换。

## 服务器变更顺序

1. 通过 Sub-Store 导出完整备份及上述五个文件的原定义，保留脚本和参数。
   备份可能含节点凭据、分享令牌，不上传到公共仓库。
   不直接覆盖运行中的 `/root/sub-store-data/sub-store.json`。
2. 为各文件准备上表参数，逐项从原定义复制真实值。尤其确认分享版仍使用 `share-temp`。
3. 在 Sub-Store 中将文件 Script Operator 改用对应公共脚本。
   推荐使用远程脚本模式，指向已发布版本的 `script/clash_proxy.js` 或 `script/surge-file.js`。
   **`mode: "link"` 从脚本 URL 的 `#` 片段读取参数，不使用 `args.arguments`**；
   将参数对象 JSON 编码后追加到 URL：`scriptURL + "#" + encodeURIComponent(JSON.stringify(args))`。
   字符串中有托管 URL、`&`、`#`、换行时也必须整体编码，不能手工拼接。
   如果暂时保留内联 `mode: "script"`，才使用现有 `args.arguments` 对象。
4. 逐个预览生成结果。普通文件、分享文件和设备文件分别验证，不要一次覆盖后只检查其中一个。
5. 预览通过后再更新客户端，先一台设备，确认后再更新其他设备。

## 验收与回滚

- Clash：节点数量符合目标集合；地区组只含匹配节点，空组是 `DIRECT`；`rules` 和
  `rule-providers` 与发布模板解析后的值一致；私有 DNS 仅作用于匹配节点。
- Clash 分享版：不能包含私有集合节点，不能把有匹配节点的地区组全部留成 `DIRECT`。
- Surge：托管头 URL 与原文件一致，节点只注入一次，select 组无空成员；
  SMM 引用均存在，iOS Ponte 的网段和设备目标不变。
- 客户端：实际导入成功，检查 AI、国内直连、Steam 下载、HKBank 例外和兜底策略；
  对 QX 的 ASN 资源解析单独确认，生成器未宣称能转换该语法。

单个文件失败时，先恢复该文件的原 Script Operator 和参数，再刷新预览。
如果问题来自基础配置，恢复已保存版本对应的远程模板地址。
无需重置仓库历史或恢复整台服务器；全部验收后再将旧备份归档。

## 测试边界

`tests/substore-scripts.test.js` 执行真实公共脚本和解析后的配置，只替换订阅获取、
ProxyUtils 的 YAML 适配及 Surge 节点名解析边界，不访问真实订阅。
它验证配置组装，不验证节点协议转换、服务器网络连通性、Sub-Store UI 操作或客户端运行时。

官方脚本上下文提供 `ProxyUtils.yaml`：
[Script Operator 实现](https://github.com/sub-store-org/Sub-Store/blob/master/backend/src/core/proxy-utils/processors/index.js)；
远程和内联模式的参数读取见
[loadScriptItem](https://github.com/sub-store-org/Sub-Store/blob/master/backend/src/core/proxy-utils/index.js)；
YAML 适配器提供 `safeLoad` / `safeDump`：
[YAML 工具](https://github.com/sub-store-org/Sub-Store/blob/master/backend/src/utils/yaml.js)。
