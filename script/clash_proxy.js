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
const urlTestGroups = [...$content.matchAll(/- name: (.+)\n    type: url-test/g)].map((m) => m[1].trim());

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
  /(- name: .+\n    type: select\n    proxies:\n)((?:      - .+\n)+)/g,
  (block, header, membersBlock) => {
    const hasRegionGroup = urlTestGroups.some((g) => membersBlock.includes(g));
    if (hasRegionGroup) {
      const nameLines = allNames.map((n) => `      - "${n}"`).join('\n');
      return `${header}${membersBlock}${nameLines}\n`;
    }
    return block;
  }
);
