// Sub-Store 文件脚本；普通版和分享版共用，差异放在 $arguments。
const { COLLECTION = 'private-proxy', DNS_OVERRIDES = {} } = $arguments;
const overrides = typeof DNS_OVERRIDES === 'string' ? JSON.parse(DNS_OVERRIDES) : DNS_OVERRIDES;
const config = ProxyUtils.yaml.safeLoad($content);
const raw = await produceArtifact({
  type: 'collection',
  name: COLLECTION,
  platform: 'ClashMeta',
});
const proxies = ProxyUtils.yaml.safeLoad(raw).proxies;
const allNames = proxies.map((proxy) => proxy.name);
const groups = config['proxy-groups'];
const regionNames = groups.filter((group) => group.type === 'url-test').map((group) => group.name);

config.proxies = proxies;
for (const group of groups) {
  if (group.filter) {
    const regex = new RegExp(group.filter);
    const names = allNames.filter((name) => regex.test(name));
    group.proxies = names.length ? names : ['DIRECT'];
    // 已完成筛选；保留 filter 会让 DIRECT 兜底再次被地区正则排除。
    delete group.filter;
  } else if (group.type === 'select' && group.proxies.some((name) => regionNames.includes(name))) {
    group.proxies = [...new Set([...group.proxies, ...allNames])];
  }
}

// 仅作用于节点域名解析，不改客户端查询或直连 DNS。
for (const [key, dns] of Object.entries(overrides)) {
  if (!key.startsWith('+.')) throw new Error(`DNS_OVERRIDES requires +.suffix keys: ${key}`);
  const domain = key.slice(2).toLowerCase();
  if (proxies.some((proxy) => {
    const server = proxy.server.toLowerCase();
    return server === domain || server.endsWith(`.${domain}`);
  })) {
    config.dns['proxy-server-nameserver-policy'] = {
      ...config.dns['proxy-server-nameserver-policy'],
      [key]: dns,
    };
  }
}

$content = ProxyUtils.yaml.safeDump(config);
