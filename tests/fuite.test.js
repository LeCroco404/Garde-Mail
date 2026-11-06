// Tests du module 3 : node --test
// fetch est remplacé par une fausse version : on vérifie précisément ce qui serait envoyé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { empreinteSha1, compterDansReponse, verifierMotDePasse } from '../public/js/fuite/pwned.js';

test('empreinte SHA-1 (valeur de référence)', async () => {
  assert.equal(await empreinteSha1('password'), '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
});

test('empreinte identique à celle de Node, y compris avec accents et espaces', async () => {
  const mdp = ' Mötdepasse été 2026 ';
  assert.equal(await empreinteSha1(mdp), createHash('sha1').update(mdp, 'utf8').digest('hex').toUpperCase());
});

test('lecture de la réponse : lignes de remplissage ignorées', () => {
  const reponse = 'AAA:0\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:52256179\r\nBBB:0';
  assert.equal(compterDansReponse(reponse, '1E4C9B93F3F0682250B6CF8331B7EE68FD8'), 52256179);
  assert.equal(compterDansReponse(reponse, 'AAA'), 0); // ligne de padding
  assert.equal(compterDansReponse(reponse, 'CCC'), 0); // absent
});

test('seul le préfixe de 5 caractères est envoyé, avec le padding et sans cookie', async () => {
  const appels = [];
  const fauxFetch = async (url, options) => {
    appels.push({ url, options });
    return { ok: true, text: async () => 'XYZ:0\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:3' };
  };

  const r = await verifierMotDePasse('password', { fetch: fauxFetch });
  assert.deepEqual(r, { prefixe: '5BAA6', nombre: 3 });

  assert.equal(appels.length, 1);
  const { url, options } = appels[0];
  assert.equal(url, 'https://api.pwnedpasswords.com/range/5BAA6');
  assert.ok(url.endsWith('/range/5BAA6') && !url.includes('1E4C9B93')); // rien après le préfixe : ni mot de passe ni suite de l'empreinte
  assert.equal(options.headers['Add-Padding'], 'true');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.body, undefined); // rien d'autre n'est transmis
});

test('mot de passe absent → nombre 0', async () => {
  const r = await verifierMotDePasse('une phrase de passe très longue et unique', {
    fetch: async () => ({ ok: true, text: async () => 'ABC:12\nDEF:0' }),
  });
  assert.equal(r.nombre, 0);
});

test('erreur du service → exception', async () => {
  await assert.rejects(
    verifierMotDePasse('x', { fetch: async () => ({ ok: false, status: 503, text: async () => '' }) }),
    /HTTP 503/,
  );
});
