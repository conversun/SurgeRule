import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { files, renderConfig } from '../script/generate-configs.mjs';

const root = new URL('../', import.meta.url);
const templates = {
  surge: '[Proxy Group]\nProxy = select,DIRECT\nFinal = select,Proxy\n[Rule]\n# {{RULES}}\n',
  clash: 'proxy-groups:\n  - name: Proxy\n  - name: Final\nrule-providers:\n# {{PROVIDERS}}\nrules:\n# {{RULES}}\n',
  qx: '[policy]\nstatic = Outside, direct\nstatic = Final, Outside\n[filter_remote]\n# {{REMOTE_RULES}}\n[filter_local]\n# {{LOCAL_RULES}}\n',
};

function manifestWith(rules, sections = []) {
  return {
    interval: 60,
    policyNames: { qx: { Proxy: 'Outside' } },
    sections: [
      { title: 'Remote', rules },
      ...sections,
      { title: 'Final', rules: [{ id: 'final', match: 'FINAL', policy: 'Final', qxOrder: 30 }] },
    ],
  };
}

function minimalManifest() {
  return manifestWith([{ id: 'first', match: 'DOMAIN,first.example', policy: 'Proxy', qxOrder: 10 }]);
}

function exampleManifest() {
  return manifestWith([
    { id: 'domainset', source: 'skk:domainset/demo', policy: 'Proxy' },
    { id: 'private', source: 'private:demo', policy: 'Proxy' },
    { id: 'native', source: 'blackmatrix7:Example/Example_Domain', policy: 'Proxy' },
    {
      id: 'custom',
      source: 'url',
      urls: {
        surge: 'https://example.com/surge.list',
        clash: 'https://example.com/clash.yaml',
        qx: 'https://example.com/qx.list',
      },
      behavior: 'classical',
      qxParser: true,
      policy: 'Proxy',
    },
    { id: 'muted', source: 'skk:non_ip/muted', policy: 'Proxy', disabled: ['clash', 'qx'] },
    { id: 'surge_only', match: 'DOMAIN,only.example', policy: 'Proxy', platforms: ['surge'] },
    { id: 'clash_only', match: 'DEST-PORT,443', policy: 'Proxy', platforms: ['clash'] },
  ], [
    {
      title: 'QX local',
      platforms: ['qx'],
      rules: [
        { id: 'later', match: 'DOMAIN,later.example', policy: 'Proxy', qxOrder: 20 },
        { id: 'earlier', match: 'DOMAIN,earlier.example', policy: 'Proxy', qxOrder: 10 },
      ],
    },
    {
      title: 'Clash section',
      platforms: ['clash'],
      rules: [{ id: 'section_only', match: 'DOMAIN,section.example', policy: 'Proxy' }],
    },
  ]);
}

function before(output, first, second) {
  expect(output).toContain(first);
  expect(output).toContain(second);
  expect(output.indexOf(first)).toBeLessThan(output.indexOf(second));
}

test('checked-in generated configs are exactly the current manifest and template renders', () => {
  const manifest = JSON.parse(readFileSync(new URL('routing/manifest.json', root), 'utf8'));
  for (const [platform, name] of Object.entries(files)) {
    const template = readFileSync(new URL(`templates/${name}`, root), 'utf8');
    expect(readFileSync(new URL(name, root), 'utf8')).toBe(renderConfig(manifest, platform, template));
  }
});

test('the read-only CLI check accepts checked-in generated configs', () => {
  const result = spawnSync('node', ['script/generate-configs.mjs', '--check'], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  for (const name of Object.values(files)) expect(result.stdout).toContain(`OK: ${name}`);
});

test('one source renders native URLs, provider behavior, and policy names on all platforms', () => {
  const manifest = exampleManifest();
  const surge = renderConfig(manifest, 'surge', templates.surge);
  const clash = Bun.YAML.parse(renderConfig(manifest, 'clash', templates.clash));
  const qx = renderConfig(manifest, 'qx', templates.qx);

  expect(surge).toContain('DOMAIN-SET,https://ruleset.skk.moe/List/domainset/demo.conf,Proxy,extended-matching');
  expect(surge).toContain('RULE-SET,https://fast.runapp.cc/https://raw.githubusercontent.com/conversun/SurgeRule/main/private/demo.list,Proxy,extended-matching');
  expect(surge).toContain('DOMAIN-SET,https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Surge/Example/Example_Domain.list,Proxy,extended-matching');
  expect(surge).toContain('RULE-SET,https://example.com/surge.list,Proxy,extended-matching');

  expect(clash['rule-providers'].domainset).toMatchObject({
    behavior: 'domain', format: 'text', url: 'https://ruleset.skk.moe/Clash/domainset/demo.txt',
    path: './ruleset/domainset.txt', interval: 60,
  });
  expect(clash['rule-providers'].private).toMatchObject({
    behavior: 'classical', format: 'text',
    url: 'https://fast.runapp.cc/https://raw.githubusercontent.com/conversun/SurgeRule/main/private/demo.list',
  });
  expect(clash['rule-providers'].native).toMatchObject({
    behavior: 'domain',
    url: 'https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/Clash/Example/Example_Domain.yaml',
  });
  expect(clash['rule-providers'].custom).toMatchObject({
    behavior: 'classical', url: 'https://example.com/clash.yaml',
  });
  expect(qx).toContain('https://ruleset.skk.moe/List/domainset/demo.conf, tag=domainset, force-policy=Outside, update-interval=60, opt-parser=true, enabled=true');
  expect(qx).toContain('https://fast.runapp.cc/https://raw.githubusercontent.com/conversun/SurgeRule/main/private/demo.list, tag=private, force-policy=Outside, update-interval=60, opt-parser=true, enabled=true');
  expect(qx).toContain('https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/QuantumultX/Example/Example_Domain.list, tag=native, force-policy=Outside, update-interval=60, opt-parser=false, enabled=true');
  expect(qx).toContain('https://example.com/qx.list, tag=custom, force-policy=Outside, update-interval=60, opt-parser=true, enabled=true');
});

test('routing order, exclusions, disabled entries, local QX order, and final rules', () => {
  const manifest = exampleManifest();
  const surge = renderConfig(manifest, 'surge', templates.surge);
  const clashText = renderConfig(manifest, 'clash', templates.clash);
  const clash = Bun.YAML.parse(clashText);
  const qx = renderConfig(manifest, 'qx', templates.qx);

  before(surge, 'DOMAIN-SET,https://ruleset.skk.moe/List/domainset/demo.conf', 'RULE-SET,https://example.com/surge.list');
  before(surge, 'DOMAIN,only.example,Proxy', 'FINAL,Final');
  expect(surge).not.toContain('DST-PORT,443');
  expect(surge).not.toContain('section.example');
  expect(surge.trimEnd().endsWith('FINAL,Final')).toBe(true);

  expect(clash.rules).toEqual([
    'RULE-SET,domainset,Proxy', 'RULE-SET,private,Proxy', 'RULE-SET,native,Proxy',
    'RULE-SET,custom,Proxy', 'DST-PORT,443,Proxy', 'DOMAIN,section.example,Proxy', 'MATCH,Final',
  ]);
  expect(clash['rule-providers'].muted).toBeDefined();
  expect(clashText).toContain('# - RULE-SET,muted,Proxy');
  expect(clashText).not.toContain('only.example');

  const remote = qx.split('[filter_remote]\n')[1].split('[filter_local]\n')[0];
  const local = qx.split('[filter_local]\n')[1];
  before(remote, 'tag=domainset', 'tag=custom');
  expect(remote).toContain('tag=muted, force-policy=Outside, update-interval=60, opt-parser=true, enabled=false');
  expect(remote).not.toContain('only.example');
  expect(remote).not.toContain('clash_only');
  before(local, 'host, earlier.example, Outside', 'host, later.example, Outside');
  before(local, 'host, later.example, Outside', 'final, Final');
  expect(local.trimEnd().endsWith('final, Final')).toBe(true);
});

test.each([
  ['undefined policy', 'surge', m => { m.sections[0].rules[0].policy = 'Missing'; }, /undefined policy Missing/],
  ['duplicate ID', 'surge', m => { m.sections[0].rules.push({ id: 'first', match: 'DOMAIN,other.example', policy: 'Proxy' }); }, /Invalid or duplicate rule id: first/],
  ['missing ID', 'surge', m => { delete m.sections[0].rules[0].id; }, /Invalid or duplicate rule id: undefined/],
  ['unknown top-level field', 'surge', m => { m.extra = true; }, /manifest: unknown field extra/],
  ['unknown section field', 'surge', m => { m.sections[0].extra = true; }, /Remote: unknown field extra/],
  ['unknown rule field', 'surge', m => { m.sections[0].rules[0].extra = true; }, /first: unknown field extra/],
  ['unknown platform', 'surge', m => { m.sections[0].rules[0].platforms = ['unknown']; }, /first: invalid platforms/],
  ['unknown disabled platform', 'surge', m => { m.sections[0].rules[0].disabled = ['unknown']; }, /first: invalid disabled/],
  ['duplicate local order', 'qx', m => { m.sections[0].rules.push({ id: 'second', match: 'DOMAIN,second.example', policy: 'Proxy', qxOrder: 10 }); }, /Duplicate qxOrder/],
  ['duplicate rendered rule', 'surge', m => { m.sections[0].rules.push({ id: 'second', match: 'DOMAIN,first.example', policy: 'Proxy' }); }, /duplicate output rule/],
  ['unsupported QX inline type', 'qx', m => { m.sections[0].rules[0].match = 'DEST-PORT,443'; }, /unsupported or invalid inline rule for qx/],
  ['missing final', 'surge', m => { m.sections.pop(); }, /exactly one FINAL must be last/],
  ['duplicate final', 'surge', m => { m.sections[0].rules.push({ id: 'other_final', match: 'FINAL', policy: 'Final' }); }, /duplicate output rule/],
  ['final before another rule', 'surge', m => { m.sections.reverse(); }, /exactly one FINAL must be last/],
  ['QX final before another local rule', 'qx', m => { m.sections.at(-1).rules[0].qxOrder = 0; }, /exactly one FINAL must be last/],
])('rejects %s', (_name, platform, change, message) => {
  const manifest = minimalManifest();
  change(manifest);
  expect(() => renderConfig(manifest, platform, templates[platform])).toThrow(message);
});

test.each([
  ['surge', 'RULES'],
  ['clash', 'RULES'],
  ['clash', 'PROVIDERS'],
  ['qx', 'REMOTE_RULES'],
  ['qx', 'LOCAL_RULES'],
])('requires exactly one %s %s placeholder', (platform, slot) => {
  const marker = `# {{${slot}}}`;
  const manifest = minimalManifest();
  expect(() => renderConfig(manifest, platform, templates[platform].replace(marker, ''))).toThrow(`Expected exactly one ${marker}`);
  expect(() => renderConfig(manifest, platform, `${templates[platform]}\n${marker}`)).toThrow(`Expected exactly one ${marker}`);
});
