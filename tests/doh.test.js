// Tests de la consultation DNS : node --test
// fetch est remplacé par une fausse version : aucun accès réseau pendant les tests.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { joindreTxt, interpreterSpf, interpreterDmarc, consulterDomaine } from '../public/js/authenticite/doh.js';

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

test('recollage des morceaux TXT', () => {
  assert.equal(joindreTxt('"v=spf1 include:a.example " "-all"'), 'v=spf1 include:a.example -all');
});

test('interprétation SPF', () => {
  assert.match(interpreterSpf(['v=spf1 mx -all']).texte, /stricte/);
  assert.match(interpreterSpf(['v=spf1 ~all']).texte, /tolérante/);
  assert.equal(interpreterSpf(['v=spf1 +all']).niveau, 'attention');
  assert.equal(interpreterSpf(['autre']).brut, null);
  assert.match(interpreterSpf(['v=spf1 -all', 'v=spf1 ~all']).texte, /plusieurs/);
});

test('interprétation DMARC', () => {
  assert.equal(interpreterDmarc(['v=DMARC1; p=reject; rua=mailto:x@example.com']).politique, 'reject');
  assert.equal(interpreterDmarc(['v=DMARC1; p=none']).niveau, 'attention');
  assert.equal(interpreterDmarc([]).politique, null);
});

test('repli sur Google si Cloudflare échoue, et DMARC hérité du domaine parent', async () => {
  const appels = [];
  globalThis.fetch = async (url) => {
    appels.push(url);
    if (url.startsWith('https://cloudflare-dns.com')) throw new Error('panne simulée');
    const nom = new URL(url).searchParams.get('name');
    const reponses = {
      'mail.example.com': ['"v=spf1 -all"'],
      '_dmarc.mail.example.com': [],
      '_dmarc.example.com': ['"v=DMARC1; p=quarantine"'],
    };
    return { ok: true, json: async () => ({ Status: 0, Answer: (reponses[nom] ?? []).map((data) => ({ type: 16, data })) }) };
  };

  const r = await consulterDomaine('mail.example.com', 'example.com');
  assert.deepEqual(r.fournisseurs, ['Google']);
  assert.equal(r.spf.brut, 'v=spf1 -all');
  assert.equal(r.dmarc.domaine, 'example.com');
  assert.equal(r.dmarc.politique, 'quarantine');
  assert.ok(appels.every((u) => !u.includes('@'))); // aucune adresse n'est envoyée, seulement des domaines
});

test('domaine invalide refusé avant toute requête', async () => {
  globalThis.fetch = async () => { throw new Error('ne doit pas être appelé'); };
  await assert.rejects(consulterDomaine('pas un domaine'), /invalide/);
});
