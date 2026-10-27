import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const files = {
  surge: 'Custom_Surge.conf',
  clash: 'Custom_Clash.yaml',
  qx: 'Custom_QX.conf',
};

const root = new URL('../', import.meta.url);
const platforms = Object.keys(files);
const privateBase = 'https://fast.runapp.cc/https://raw.githubusercontent.com/conversun/SurgeRule/main/private/';
const blackmatrixBase = 'https://cdn.jsdelivr.net/gh/blackmatrix7/ios_rule_script@master/rule/';

function applies(item, platform) {
  return !item.platforms || item.platforms.includes(platform);
}

function assertKeys(object, keys, context) {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new Error(`${context}: unknown field ${key}`);
  }
}

function validateManifest(manifest) {
  assertKeys(manifest, ['interval', 'policyNames', 'sections'], 'manifest');
  if (!Number.isInteger(manifest.interval) || manifest.interval <= 0) {
    throw new Error('interval must be a positive integer');
  }
  assertKeys(manifest.policyNames, platforms, 'policyNames');
  const ids = new Set();
  for (const section of manifest.sections) {
    assertKeys(section, ['title', 'qxTitle', 'platforms', 'note', 'rules'], section.title);
    for (const item of [section, ...section.rules]) {
      for (const field of ['platforms', 'disabled']) {
        if (item[field] !== undefined && (
          !Array.isArray(item[field]) || item[field].some(p => !platforms.includes(p)) ||
          (field === 'platforms' && item[field].length === 0)
        )) {
          throw new Error(`${item.id || section.title}: invalid ${field}`);
        }
      }
    }
    for (const rule of section.rules) {
      assertKeys(rule, [
        'id', 'source', 'match', 'policy', 'platforms', 'disabled', 'note',
        'urls', 'behavior', 'qxParser', 'qxTag', 'qxOrder', 'surgeSource',
        'surgeOptions', 'clashOptions', 'clashPath',
      ], rule.id);
      if (typeof rule.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(rule.id) || ids.has(rule.id)) {
        throw new Error(`Invalid or duplicate rule id: ${rule.id}`);
      }
      ids.add(rule.id);
      if (Boolean(rule.source) === Boolean(rule.match)) {
        throw new Error(`${rule.id}: specify exactly one of source or match`);
      }
      if (typeof rule.policy !== 'string' || !rule.policy.trim()) {
        throw new Error(`${rule.id}: missing policy`);
      }
      const targets = platforms.filter(p => applies(section, p) && applies(rule, p));
      if (!targets.length || rule.disabled?.some(p => !targets.includes(p))) {
        throw new Error(`${rule.id}: platform exclusions leave no target or invalid disabled platform`);
      }
      for (const field of ['surgeOptions', 'clashOptions']) {
        if (rule[field] !== undefined && (
          !Array.isArray(rule[field]) || rule[field].some(option => typeof option !== 'string')
        )) {
          throw new Error(`${rule.id}: ${field} must be an array of strings`);
        }
      }
      if (rule.urls) assertKeys(rule.urls, platforms, `${rule.id}.urls`);
    }
  }
}

function sourceFor(rule, platform) {
  const [source, path, extra] = rule.source.split(':');
  if (extra !== undefined) throw new Error(`${rule.id}: invalid source`);
  if (source !== 'url' && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path || '')) {
    throw new Error(`${rule.id}: invalid source path`);
  }
  let url, behavior, format, qxParser, extension;
  switch (source) {
    case 'skk':
      behavior = path.startsWith('domainset/') ? 'domain' : 'classical';
      url = platform === 'clash'
        ? `https://ruleset.skk.moe/Clash/${path}.txt`
        : `https://ruleset.skk.moe/List/${path}.conf`;
      format = 'text';
      extension = 'txt';
      qxParser = true;
      break;
    case 'private':
      url = `${privateBase}${path}.list`;
      behavior = 'classical';
      format = 'text';
      extension = 'list';
      qxParser = true;
      break;
    case 'blackmatrix7': {
      const native = { surge: 'Surge', clash: 'Clash', qx: 'QuantumultX' }[platform];
      const nativePath = path.includes('/') ? path : `${path}/${path}`;
      url = `${blackmatrixBase}${native}/${nativePath}.${platform === 'clash' ? 'yaml' : 'list'}`;
      behavior = path.endsWith('_Domain') ? 'domain' : 'classical';
      extension = 'yaml';
      qxParser = false;
      break;
    }
    case 'url':
      url = rule.urls?.[platform];
      behavior = rule.behavior;
      extension = 'yaml';
      qxParser = rule.qxParser ?? false;
      break;
    default:
      throw new Error(`${rule.id}: unsupported source ${source}`);
  }
  if (!['domain', 'classical'].includes(behavior) || !url || !['https:', 'http:'].includes(new URL(url).protocol)) {
    throw new Error(`${rule.id}: invalid URL or behavior for ${platform}`);
  }
  return { url, behavior, format, qxParser, path: rule.clashPath ?? `./ruleset/${rule.id}.${extension}` };
}

function policyNames(template, platform) {
  const patterns = {
    surge: /^([^#\n=]+?)\s*=\s*(?:select|smart|url-test|fallback|load-balance),/gm,
    clash: /^  - name: (.+)$/gm,
    qx: /^(?:static|available|round-robin|url-latency-benchmark)\s*=\s*([^,\n]+)/gm,
  };
  const builtins = platform === 'qx'
    ? ['direct', 'reject', 'proxy']
    : ['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-NO-DROP'];
  return new Set([...builtins, ...[...template.matchAll(patterns[platform])].map(m => m[1].trim())]);
}

function inlineRule(rule, platform, policy) {
  const [type, ...values] = rule.match.split(',');
  const common = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'GEOIP', 'FINAL'];
  const supported = platform === 'qx' ? common : [...common, 'DEST-PORT', 'IP-CIDR', 'IP-CIDR6', 'IP-ASN', 'PROCESS-NAME', 'AND', 'OR', 'NOT'];
  if (!supported.includes(type) || (type !== 'FINAL' && values.length === 0)) {
    throw new Error(`${rule.id}: unsupported or invalid inline rule for ${platform}: ${rule.match}`);
  }
  if (platform === 'qx') {
    const nativeType = {
      DOMAIN: 'host', 'DOMAIN-SUFFIX': 'host-suffix', 'DOMAIN-KEYWORD': 'host-keyword',
      GEOIP: 'geoip', FINAL: 'final',
    }[type];
    return [nativeType, ...values.map(v => type === 'GEOIP' ? v.toLowerCase() : v), policy].join(', ');
  }
  const match = platform === 'clash'
    ? rule.match.replace(/^DEST-PORT,/, 'DST-PORT,').replace(/^FINAL$/, 'MATCH')
    : rule.match;
  const options = rule[`${platform}Options`] ?? [];
  return [match, policy, ...options].join(',');
}

function replaceSlot(template, slot, content) {
  const marker = `# {{${slot}}}`;
  if (template.split(marker).length !== 2) {
    throw new Error(`Expected exactly one ${marker} in template`);
  }
  return template.replace(marker, () => content);
}

export function renderConfig(manifest, platform, template) {
  if (!platforms.includes(platform)) throw new Error(`Unknown platform: ${platform}`);
  validateManifest(manifest);
  const policies = policyNames(template, platform);
  const blocks = [];
  const providers = [];
  const localRules = [];
  const activeRules = [];
  const emitted = new Set();

  for (const section of manifest.sections.filter(s => applies(s, platform))) {
    const lines = [];
    for (const rule of section.rules.filter(r => applies(r, platform))) {
      const policy = manifest.policyNames[platform]?.[rule.policy] ?? rule.policy;
      if (!policies.has(policy)) throw new Error(`${platform}/${rule.id}: undefined policy ${policy}`);
      const disabled = rule.disabled?.includes(platform) ?? false;
      let line;
      if (rule.source) {
        const source = sourceFor(rule, platform);
        switch (platform) {
          case 'surge':
            line = [
              source.behavior === 'domain' ? 'DOMAIN-SET' : 'RULE-SET',
              rule.surgeSource ?? source.url, policy,
              ...(rule.surgeOptions ?? ['extended-matching']),
            ].join(',');
            break;
          case 'clash':
            providers.push([
              `  ${rule.id}:`,
              '    type: http',
              `    behavior: ${source.behavior}`,
              ...(source.format ? [`    format: ${source.format}`] : []),
              `    url: ${JSON.stringify(source.url)}`,
              `    path: ${source.path}`,
              `    interval: ${manifest.interval}`,
            ].join('\n'));
            line = `RULE-SET,${rule.id},${policy}`;
            break;
          case 'qx':
            line = `${source.url}, tag=${rule.qxTag ?? rule.id}, force-policy=${policy}, update-interval=${manifest.interval}, opt-parser=${source.qxParser}, enabled=${!disabled}`;
            break;
        }
      } else {
        line = inlineRule(rule, platform, policy);
      }
      if (emitted.has(line)) throw new Error(`${platform}/${rule.id}: duplicate output rule`);
      emitted.add(line);
      if (!rule.source && platform === 'qx') {
        if (!Number.isInteger(rule.qxOrder) || rule.qxOrder < 0) {
          throw new Error(`${rule.id}: inline QX rules require an explicit qxOrder`);
        }
        localRules.push({ rule, line, disabled });
        continue;
      }
      if (!disabled) activeRules.push(rule);
      if (rule.note) lines.push(`# ${rule.note}`);
      lines.push(`${disabled && platform !== 'qx' ? '# ' : ''}${platform === 'clash' ? '- ' : ''}${line}`);
    }
    if (lines.length) {
      const title = platform === 'qx' && Object.hasOwn(section, 'qxTitle') ? section.qxTitle : section.title;
      blocks.push([
        ...(title ? [`# ====== ${title} ======`] : []),
        ...(section.note ? [`# ${section.note}`] : []),
        ...lines,
      ].map(line => platform === 'clash' ? `  ${line}` : line).join('\n'));
    }
  }

  localRules.sort((a, b) => a.rule.qxOrder - b.rule.qxOrder);
  const localOrders = localRules.map(({ rule }) => rule.qxOrder);
  if (new Set(localOrders).size !== localOrders.length) throw new Error('Duplicate qxOrder');
  if (platform === 'qx') activeRules.push(...localRules.filter(r => !r.disabled).map(r => r.rule));
  if (activeRules.filter(r => r.match === 'FINAL').length !== 1 || activeRules.at(-1)?.match !== 'FINAL') {
    throw new Error(`${platform}: exactly one FINAL must be last`);
  }

  let output = template;
  if (platform === 'qx') {
    output = replaceSlot(output, 'REMOTE_RULES', blocks.join('\n\n'));
    output = replaceSlot(output, 'LOCAL_RULES', localRules.map(({ rule, line, disabled }) => [
      ...(rule.note ? [`# ${rule.note}`] : []),
      `${disabled ? '# ' : ''}${line}`,
    ].join('\n')).join('\n\n'));
  } else {
    output = replaceSlot(output, 'RULES', blocks.join('\n\n'));
    if (platform === 'clash') output = replaceSlot(output, 'PROVIDERS', providers.join('\n\n'));
  }
  if (/^# \{\{[A-Z_]+\}\}$/m.test(output)) throw new Error(`${platform}: unresolved template slot`);
  return `# Generated by script/generate-configs.mjs; edit routing/manifest.json or templates/${files[platform]}.\n${output}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    throw new Error('Usage: node script/generate-configs.mjs [--check]');
  }
  const manifest = JSON.parse(await readFile(new URL('routing/manifest.json', root), 'utf8'));
  // Render and validate every platform before writing any output.
  const outputs = await Promise.all(platforms.map(async platform => {
    const name = files[platform];
    const template = await readFile(new URL(`templates/${name}`, root), 'utf8');
    return { name, content: renderConfig(manifest, platform, template) };
  }));
  let stale = false;
  for (const { name, content } of outputs) {
    const path = new URL(name, root);
    if (args[0] === '--check') {
      if (await readFile(path, 'utf8') !== content) {
        console.error(`OUT OF DATE: ${name}`);
        stale = true;
      } else {
        console.log(`OK: ${name}`);
      }
    } else {
      await writeFile(path, content);
      console.log(`Generated: ${name}`);
    }
  }
  if (stale) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
