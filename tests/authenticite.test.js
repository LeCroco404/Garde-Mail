// Tests du module 1 : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyserEnTetes, lireEnTetes, lireAuthResults, decoderMotsEncodes } from '../public/js/authenticite/moteur.js';

const exemple = (nom) => readFileSync(new URL(`../exemples/${nom}`, import.meta.url), 'utf8');
const codes = (r) => r.signaux.map((s) => s.code).sort();

/* --- Lecture --- */

test('dépliage des en-têtes et arrêt au corps', () => {
  const e = lireEnTetes('Subject: un\n  deux\nFrom: a@example.com\n\nX-Corps: ignoré');
  assert.deepEqual(e, [{ nom: 'subject', valeur: 'un deux' }, { nom: 'from', valeur: 'a@example.com' }]);
});

test('Authentication-Results format Gmail', () => {
  const ar = lireAuthResults('mx.google.com; dkim=pass header.i=@example.com; spf=softfail (google.com: x; y) smtp.mailfrom=b@example.net; dmarc=pass (p=REJECT sp=NONE) header.from=example.com');
  assert.equal(ar.serveur, 'mx.google.com');
  assert.deepEqual(ar.resultats.map((r) => `${r.methode}=${r.resultat}`), ['dkim=pass', 'spf=softfail', 'dmarc=pass']);
  assert.equal(ar.resultats[1].proprietes['smtp.mailfrom'], 'b@example.net'); // le « ; » du commentaire est ignoré
  assert.equal(ar.resultats[2].proprietes.p, 'REJECT');
});

test('Authentication-Results format Microsoft (sans identifiant de serveur)', () => {
  const ar = lireAuthResults('spf=pass (sender IP is 203.0.113.1) smtp.mailfrom=example.com; dkim=none (message not signed) header.d=none;dmarc=none action=none header.from=example.com;compauth=fail reason=001');
  assert.equal(ar.serveur, null);
  assert.equal(ar.resultats.find((r) => r.methode === 'compauth').resultat, 'fail');
});

test('décodage des noms encodés', () => {
  assert.equal(decoderMotsEncodes('=?UTF-8?Q?Cr=C3=A9dit_Agricole?='), 'Crédit Agricole');
  assert.equal(decoderMotsEncodes('=?UTF-8?B?QW1lbGk=?= <a@b.fr>'), 'Ameli <a@b.fr>');
  assert.equal(decoderMotsEncodes('=?inconnu?Q?abc?='), '=?inconnu?Q?abc?='); // encodage inconnu : inchangé
});

/* --- Exemples complets --- */

test('exemple légitime Gmail → authentique', () => {
  const r = analyserEnTetes(exemple('m1-legitime-gmail.txt'));
  assert.equal(r.statut, 'authentique');
  assert.equal(r.expediteur.nom, 'Exemple Banque – Service client');
  assert.equal(r.spf.aligne, true);
  assert.equal(r.dmarc.politique, 'reject');
  assert.deepEqual(codes(r), []);
});

test('exemple usurpé → usurpé probable, faux en-tête ignoré', () => {
  const r = analyserEnTetes(exemple('m1-usurpe.txt'));
  assert.equal(r.statut, 'usurpe');
  assert.equal(r.dmarc.resultat, 'fail'); // le faux « dmarc=pass » plus bas n'est pas pris en compte
  assert.deepEqual(codes(r), ['S1', 'S3', 'S5']);
});

test('nom affiché qui imite un organisme → douteux malgré DMARC réussi', () => {
  const r = analyserEnTetes(exemple('m1-imitation-marque.txt'));
  assert.equal(r.statut, 'douteux');
  assert.deepEqual(codes(r), ['S4', 'S8']);
});

test('newsletter via prestataire (format Microsoft) → authentique grâce à DKIM', () => {
  const r = analyserEnTetes(exemple('m1-newsletter-microsoft.txt'));
  assert.equal(r.statut, 'authentique');
  assert.equal(r.spf.aligne, false);
  assert.equal(r.dkim[0].aligne, true);
  assert.equal(r.compauth, 'pass');
  assert.deepEqual(codes(r), ['S1']);
});

test('aucun résultat d’authentification → douteux', () => {
  const r = analyserEnTetes(exemple('m1-sans-resultats.txt'));
  assert.equal(r.statut, 'douteux');
});

test('sans From → analyse impossible', () => {
  assert.equal(analyserEnTetes('Subject: bonjour\n\ncorps').statut, 'impossible');
  assert.equal(analyserEnTetes('').statut, 'impossible');
});

test('SPF en échec sans DMARC ni DKIM → usurpé probable', () => {
  const r = analyserEnTetes('Authentication-Results: mx.example.org; spf=fail smtp.mailfrom=example.com; dkim=none; dmarc=none header.from=example.com\nFrom: <a@example.com>\n');
  assert.equal(r.statut, 'usurpe');
});

test('messagerie gratuite signalée en information seulement', () => {
  const r = analyserEnTetes('Authentication-Results: mx.google.com; dkim=pass header.i=@gmail.com; spf=pass smtp.mailfrom=a@gmail.com; dmarc=pass (p=NONE) header.from=gmail.com\nFrom: Jean <jean@gmail.com>\n');
  assert.equal(r.statut, 'authentique');
  assert.deepEqual(codes(r), ['S7']);
});
