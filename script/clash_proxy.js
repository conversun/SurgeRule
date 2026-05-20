const raw = await produceArtifact({
  type: 'collection',
  name: 'private-proxy',
  platform: 'ClashMeta',
});

const proxies = ProxyUtils.parse(raw);
const allNames = proxies.map((p) => p.name);

let proxyYaml = ProxyUtils.produce(proxies, 'ClashMeta');
proxyYaml = proxyYaml.replace(/^proxies:\n?/m, '');
$content = $content.replace(/^proxies:.*$/m, `proxies:\n${proxyYaml}`);

// ===================== 识别 url-test 类型组（地区组）=====================
const urlTestGroups = [...$content.matchAll(/- name: (.+)\n(?:    .+\n)*?    type: url-test/g)].map((m) => m[1].trim());

// ===================== url-test 组注入过滤后的节点 =====================
$content = $content.replace(
  /    filter: "(.+)"\n    proxies: \[\]/g,
  (_, filterStr) => {
    const regex = new RegExp(filterStr);
    const names = allNames.filter((n) => regex.test(n));
    const nameLines = names.map((n) => `      - "${n}"`).join('\n');
    return `    proxies:\n${nameLines}`;
  }
);

// ===================== select 组自动追加全部节点 =====================
// 含地区组的 select 组才需要注入 allNames
$content = $content.replace(
  /(- name: .+\n(?:    .+\n)*?    type: select\n    proxies:\n)((?:      - .+\n)+)/g,
  (block, header, membersBlock) => {
    const hasRegionGroup = urlTestGroups.some((g) => membersBlock.includes(g));
    if (hasRegionGroup) {
      const nameLines = allNames.map((n) => `      - "${n}"`).join('\n');
      return `${header}${membersBlock}${nameLines}\n`;
    }
    return block;
  }
);

// ===================== 节点专用 DNS 注入 =====================
// Surge [Host] *.foo.com = server:X 在 mihomo 里对应 dns.proxy-server-nameserver-policy
// 重要: 不是 nameserver-policy ! mihomo 把 DNS 拆成三条独立路径:
//   - nameserver-policy            -> 客户端查询走哪个上游
//   - direct-nameserver(+policy)   -> 直连 dial 用
//   - proxy-server-nameserver(+policy) -> dial proxy server hostname 用 ← 节点需要这个
// key: 必须用 +.suffix 后缀格式 (匹配根域 + 所有子域)
// value: DNS server (支持 udp/tcp/https/quic, 见 mihomo 文档)
// 只有订阅里实际出现匹配后缀的节点时, 对应规则才会被注入
const DNS_OVERRIDES = {
  // '+.your-private.domain': 'your-dns-server:port',
};

const activeDnsLines = Object.entries(DNS_OVERRIDES)
  .filter(([key]) => {
    const suffix = key.slice(1); // "+.foo.com" -> ".foo.com"
    return proxies.some(
      (p) => typeof p.server === 'string' && p.server.toLowerCase().endsWith(suffix)
    );
  })
  .map(([key, dns]) => `    "${key}": "${dns}"`);

if (activeDnsLines.length > 0) {
  // 在 proxy-server-nameserver 列表块后面插入 proxy-server-nameserver-policy 子块
  const policyBlock =
    '  proxy-server-nameserver-policy:\n' +
    activeDnsLines.join('\n') + '\n';
  $content = $content.replace(
    /(  proxy-server-nameserver:\n(?:    - .+\n)+)/,
    (block) => `${block}${policyBlock}`
  );
}
