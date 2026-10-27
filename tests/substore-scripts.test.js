import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const clashBase = readFileSync(new URL('Custom_Clash.yaml', root), 'utf8');
const surgeBase = readFileSync(new URL('Custom_Surge.conf', root), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const scripts = Object.fromEntries(['clash_proxy.js', 'surge-file.js'].map(name => [
  name,
  new AsyncFunction('$content', '$arguments', 'produceArtifact', 'ProxyUtils',
    `${readFileSync(new URL(`script/${name}`, root), 'utf8')}\nreturn $content;`),
]));
const nodes = ['HK "quoted" \\ node', 'US Test', 'SG Test', 'JP Test', 'HK Game'].map(name => ({
  name, type: 'ss', server: 'edge.nodes.example', port: 443,
  cipher: 'aes-128-gcm', password: 'fixture',
}));

async function inject(name, content, args, proxies) {
  // Mock only Sub-Store's boundary: return native serialized artifacts and parse
  // the actual string passed by the script, not a precomputed list of names.
  const produceArtifact = async request => {
    expect(request).toEqual({
      type: 'collection',
      name: args.COLLECTION ?? 'private-proxy',
      platform: name === 'clash_proxy.js' ? 'ClashMeta' : 'Surge',
    });
    if (request.platform === 'ClashMeta') return Bun.YAML.stringify({ proxies });
    return proxies.map(proxy =>
      `${proxy.name} = ss, ${proxy.server}, 443, encrypt-method=aes-128-gcm, password=fixture`,
    ).join('\n');
  };
  const ProxyUtils = {
    yaml: { safeLoad: Bun.YAML.parse, safeDump: Bun.YAML.stringify },
    parse: raw => raw.split('\n').filter(Boolean).map(line => ({ name: line.split(' = ')[0] })),
  };
  return scripts[name](content, args, produceArtifact, ProxyUtils);
}

function section(content, name) {
  return content.split(`[${name}]\n`)[1].split(/\n\[/)[0].trim();
}

test.each(['private-proxy', 'share-temp'])('Clash %s uses the selected collection and preserves routing', async COLLECTION => {
  const before = Bun.YAML.parse(clashBase);
  const after = Bun.YAML.parse(await inject('clash_proxy.js', clashBase, { COLLECTION }, nodes));
  expect(after.proxies).toEqual(nodes);
  const groups = Object.fromEntries(after['proxy-groups'].map(group => [group.name, group]));
  expect(groups['🇭🇰 HK'].proxies).toEqual([nodes[0].name]);
  expect(groups['🏠 ISP'].proxies).toEqual(['US Test']);
  expect(groups.Proxy.proxies).toContain(nodes[0].name);
  expect(groups.Proxy.proxies).toContain('HK Game');
  for (const group of after['proxy-groups']) expect(group.filter).toBeUndefined();
  for (const key of Object.keys(before).filter(key => !['proxies', 'proxy-groups'].includes(key))) {
    expect(after[key]).toEqual(before[key]);
  }
});

test.each([[[]], [['DIRECT']]])('Clash empty collections replace either placeholder with DIRECT', async placeholder => {
  const config = Bun.YAML.parse(clashBase);
  const filtered = config['proxy-groups'].filter(group => group.filter);
  for (const group of filtered) group.proxies = placeholder;
  const after = Bun.YAML.parse(await inject('clash_proxy.js', Bun.YAML.stringify(config), { COLLECTION: 'share-temp' }, []));
  expect(after.proxies).toEqual([]);
  for (const group of after['proxy-groups'].filter(group => filtered.some(old => old.name === group.name))) {
    expect(group.proxies).toEqual(['DIRECT']);
    expect(group.filter).toBeUndefined();
  }
});

test('Clash unmatched regions get DIRECT while matching nodes are retained', async () => {
  const after = Bun.YAML.parse(await inject('clash_proxy.js', clashBase, {}, [nodes[0]]));
  expect(after['proxy-groups'].find(group => group.name === '🇭🇰 HK').proxies).toEqual([nodes[0].name]);
  expect(after['proxy-groups'].find(group => group.name === '🇯🇵 JP').proxies).toEqual(['DIRECT']);
});

test.each([false, true])('Clash DNS overrides accept object or JSON arguments (%s)', async asJSON => {
  const config = Bun.YAML.parse(clashBase);
  config.dns['proxy-server-nameserver-policy'] = { '+.existing.example': '192.0.2.1:53' };
  const overrides = { '+.nodes.example': '192.0.2.2:1053', '+.unused.example': '192.0.2.3:53' };
  const output = await inject('clash_proxy.js', Bun.YAML.stringify(config), {
    DNS_OVERRIDES: asJSON ? JSON.stringify(overrides) : overrides,
  }, [{ ...nodes[0], server: 'NODES.EXAMPLE' }]);
  const dns = Bun.YAML.parse(output).dns;
  expect(dns['proxy-server-nameserver-policy']).toEqual({
    '+.existing.example': '192.0.2.1:53',
    '+.nodes.example': '192.0.2.2:1053',
  });
  expect(dns['nameserver-policy']).toEqual(config.dns['nameserver-policy']);
  expect(dns['direct-nameserver']).toEqual(config.dns['direct-nameserver']);
});

test('Clash DNS suffix matching excludes lookalike domains and accepts subdomains', async () => {
  const args = { DNS_OVERRIDES: { '+.nodes.example': '192.0.2.2:1053' } };
  const unrelated = await inject('clash_proxy.js', clashBase, args, [{ ...nodes[0], server: 'notnodes.example' }]);
  expect(Bun.YAML.parse(unrelated).dns['proxy-server-nameserver-policy']).toBeUndefined();
  const related = await inject('clash_proxy.js', clashBase, args, [nodes[0]]);
  expect(Bun.YAML.parse(related).dns['proxy-server-nameserver-policy']).toEqual(args.DNS_OVERRIDES);
});

test('Clash rejects invalid DNS override keys', async () => {
  await expect(inject('clash_proxy.js', clashBase, { DNS_OVERRIDES: { '*.example': '192.0.2.2' } }, nodes))
    .rejects.toThrow('DNS_OVERRIDES requires +.suffix keys');
});

const managedURL = 'https://substore.example/file/surge';
const surgeNodes = [{ ...nodes[1], name: 'US Test' }, { ...nodes[2], name: 'SG Test' }];

test.each(['private-proxy', 'private-proxy-xt'])('Surge %s preserves base routing and adds nodes once', async COLLECTION => {
  const output = await inject('surge-file.js', surgeBase, { COLLECTION, MANAGED_URL: managedURL }, surgeNodes);
  expect(output.split('\n')[0]).toBe(`#!MANAGED-CONFIG ${managedURL} interval=86400`);
  expect(section(output, 'Proxy')).toContain('US Test = ss,');
  expect(section(output, 'Rule')).toBe(section(surgeBase, 'Rule'));
  for (const name of ['General', 'Host', 'MITM']) {
    expect(section(output, name)).toBe(section(surgeBase, name));
  }
  const selectGroups = section(output, 'Proxy Group').split('\n').filter(line => line.includes('= select,'));
  expect(selectGroups.length).toBeGreaterThan(0);
  for (const group of selectGroups) {
    const members = group.split(',').map(part => part.trim());
    expect(members.filter(name => name === 'US Test')).toHaveLength(1);
    expect(members.filter(name => name === 'SG Test')).toHaveLength(1);
  }
  expect(section(output, 'Proxy Group')).not.toMatch(/^SMM\s*=/m);
});

test('Surge SMM only references existing region groups and prepends its rules', async () => {
  const output = await inject('surge-file.js', surgeBase, { MANAGED_URL: managedURL, SMM: 'true' }, surgeNodes);
  const groups = section(output, 'Proxy Group');
  const smm = groups.split('\n').find(line => line.startsWith('SMM ='));
  const defined = new Set([...groups.matchAll(/^([^#\n=]+?)\s*=/gm)].map(match => match[1].trim()));
  for (const member of smm.split(',').slice(1)) {
    expect(defined.has(member) || member === 'DIRECT' || surgeNodes.some(node => node.name === member)).toBe(true);
  }
  expect(smm).not.toContain('🇼🇸 TW');
  expect(section(output, 'Rule').split('\n')[0]).toBe('DOMAIN-SUFFIX,bulkfollows.com,SMM');
  expect(section(output, 'Rule')).toContain(section(surgeBase, 'Rule'));
});

test('Surge iOS keeps private Ponte rules in arguments and before base routing', async () => {
  const rules = 'IP-CIDR,192.0.2.0/24,DEVICE:EXAMPLE,no-resolve';
  const output = await inject('surge-file.js', surgeBase, { MANAGED_URL: managedURL, PONTE_RULES: rules }, []);
  expect(section(output, 'Rule').split('\n')[0]).toBe(rules);
  expect(section(output, 'Rule')).toContain(section(surgeBase, 'Rule'));
  expect(section(output, 'Proxy')).toBe('');
  expect(section(output, 'Proxy Group')).not.toMatch(/,\s*$/m);
});

test('Surge empty collection does not append an empty member', async () => {
  const output = await inject('surge-file.js', surgeBase, { MANAGED_URL: managedURL }, []);
  expect(section(output, 'Proxy')).toBe('');
  expect(section(output, 'Proxy Group')).not.toMatch(/,\s*$/m);
});

test('Surge rejects missing managed URLs and duplicate SMM definitions', async () => {
  await expect(inject('surge-file.js', surgeBase, {}, [])).rejects.toThrow('MANAGED_URL');
  const duplicate = surgeBase.replace('[Proxy Group]\n', '[Proxy Group]\nSMM = select,DIRECT\n');
  await expect(inject('surge-file.js', duplicate, { MANAGED_URL: managedURL, SMM: true }, []))
    .rejects.toThrow('SMM is already defined');
});
