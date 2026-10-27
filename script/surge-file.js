// Sub-Store 文件脚本；不使用被忽略的私有 script/surge_proxy.js。
const {
  COLLECTION = 'private-proxy',
  MANAGED_URL,
  SMM = false,
  PONTE_RULES = '',
} = $arguments;

if (typeof MANAGED_URL !== 'string' || !/^https?:\/\/\S+$/.test(MANAGED_URL)) {
  throw new Error('MANAGED_URL must be an HTTP(S) URL without whitespace');
}
const smmEnabled = SMM === true || SMM === 'true';
const raw = await produceArtifact({ type: 'collection', name: COLLECTION, platform: 'Surge' });
const names = ProxyUtils.parse(raw).map((proxy) => proxy.name);

function updateSection(name, transform) {
  const header = `[${name}]\n`;
  const start = $content.indexOf(header);
  if (start === -1) throw new Error(`Missing Surge section: ${name}`);
  const bodyStart = start + header.length;
  const next = $content.indexOf('\n[', bodyStart);
  const end = next === -1 ? $content.length : next + 1;
  $content = $content.slice(0, bodyStart) + transform($content.slice(bodyStart, end)).trimEnd() +
    '\n\n' + $content.slice(end);
}

updateSection('Proxy', () => raw.trim());
updateSection('Proxy Group', (body) => {
  if (smmEnabled) {
    if (/^SMM\s*=/m.test(body)) throw new Error('SMM is already defined in the base config');
    // 只引用模板中真实存在的自动地区组，不再硬编码已移除的台湾组。
    const regions = [...body.matchAll(/^([^#\n=]+?)\s*=\s*(?:smart|url-test),/gm)]
      .map((match) => match[1].trim());
    body = `SMM = select,${['Proxy', 'DIRECT', ...regions].join(',')}\n${body}`;
  }
  return body.replace(/^(.+?\s*=\s*select,)(.+)$/gm, (_, prefix, rest) => {
    const parts = rest.split(',').map((part) => part.trim());
    const members = parts.filter((part) => !part.includes('='));
    const options = parts.filter((part) => part.includes('='));
    return prefix + [...new Set([...members, ...names]), ...options].join(',');
  });
});

const extraRules = [];
if (PONTE_RULES.trim()) extraRules.push(PONTE_RULES.trim());
if (smmEnabled) {
  extraRules.push(
    'DOMAIN-SUFFIX,bulkfollows.com,SMM',
    'DOMAIN-SUFFIX,peakerr.com,SMM',
    'DOMAIN-SUFFIX,justanotherpanel.com,SMM',
    'DOMAIN-KEYWORD,smm,SMM',
  );
}
if (extraRules.length) updateSection('Rule', (body) => `${extraRules.join('\n')}\n${body}`);
$content = `#!MANAGED-CONFIG ${MANAGED_URL} interval=86400\n${$content}`;
