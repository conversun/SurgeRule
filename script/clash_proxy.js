const raw = await produceArtifact({
  type: 'collection',
  name: 'proxy',
  platform: 'ClashMeta',
});

const proxies = ProxyUtils.parse(raw);
const allNames = proxies.map((p) => p.name);

let proxyYaml = ProxyUtils.produce(proxies, 'ClashMeta');
proxyYaml = proxyYaml.replace(/^proxies:\n?/m, '');
$content = $content.replace(/^proxies:.*$/m, `proxies:\n${proxyYaml}`);

$content = $content.replace(
  /    filter: "(.+)"\n    proxies: \[\]/g,
  (_, filterStr) => {
    const regex = new RegExp(filterStr);
    const names = allNames.filter((n) => regex.test(n));
    const nameLines = names.map((n) => `      - "${n}"`).join('\n');
    return `    proxies:\n${nameLines}`;
  }
);
