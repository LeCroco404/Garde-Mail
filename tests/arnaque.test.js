// Tests du module 2 : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyserMessage, analyserLien, extraireLiens, normaliserTexte, distance } from '../public/js/arnaque/moteur.js';

const exemple = (nom) => analyserMessage(readFileSync(new URL(`../exemples/${nom}`, import.meta.url), 'utf8'));
const codes = (r) => r.signaux.map((s) => s.code).sort();

/* --- Briques --- */

test('normalisation : même longueur, sans accents ni majuscules', () => {
  const t = 'Réglez IMMÉDIATEMENT l’amende';
  assert.equal(normaliserTexte(t), "reglez immediatement l'amende");
  assert.equal(normaliserTexte(t).length, t.length);
});

test('distance entre mots', () => {
  assert.equal(distance('paypal', 'paypla'), 1); // inversion de deux lettres
  assert.equal(distance('laposte', 'lapostte'), 1);
  assert.equal(distance('impots', 'import'), 2);
});

test('extraction des liens : complets, www, domaines nus, sans adresses mail', () => {
  const liens = extraireLiens('Voir https://a.example.com/x, www.b.example.org ou suivi-colis.test/ab12. Écrire à contact@exemple.fr. M.Dupont, rdv à 9h.30');
  assert.deepEqual(liens.map((l) => l.hote), ['a.example.com', 'www.b.example.org', 'suivi-colis.test']);
  assert.equal(liens[0].affiche, 'hxxps://a[.]example[.]com/x'); // ponctuation finale retirée, lien défangé
});

test('le même hôte n’est compté qu’une fois', () => {
  assert.equal(extraireLiens('https://x.test/a et https://x.test/b').length, 1);
});

test('analyse des liens', () => {
  assert.equal(analyserLien('www.laposte.fr').officiel, 'La Poste / Colissimo');
  assert.equal(analyserLien('laposte-suivi.test').signal.code, 'L1');
  assert.equal(analyserLien('impots.gouv.fr.remboursement.test').signal.code, 'L2');
  assert.equal(analyserLien('www.paypa1.test').signal.code, 'L3');
  assert.equal(analyserLien('amazom.test').signal.code, 'L3');
  assert.equal(analyserLien('xn--80ak6aa92e.test').signal.code, 'L4');
  assert.equal(analyserLien('xn--pypal-4ve.test').signal.code, 'L3'); // « pypal » : la faute volontaire l'emporte
  assert.equal(analyserLien('bit.ly').signal.code, 'L5');
  assert.equal(analyserLien('203.0.113.9').signal.code, 'L6');
  assert.equal(analyserLien('apply-now.test').signal, null); // « apply » n'est pas pris pour « apple »
  assert.equal(analyserLien('example.org').signal, null);
});

test('caractères non latins convertis en punycode à l’extraction', () => {
  const [lien] = extraireLiens('https://раypal.test/'); // « ра » en cyrillique
  assert.ok(lien.hote.startsWith('xn--'));
  assert.equal(analyserLien(lien.hote).signal.code, 'L4');
});

test('numéro surtaxé', () => {
  assert.deepEqual(codes(analyserMessage('Rappelez le 0 899 12 34 56.')), ['T6']);
  assert.deepEqual(codes(analyserMessage('Rappelez le 01 23 45 67 89.')), []);
});

/* --- Exemples complets --- */

test('faux colis → très suspect (80)', () => {
  const r = exemple('m2-faux-colis.txt');
  assert.equal(r.score, 80);
  assert.equal(r.niveau, 'eleve');
  assert.deepEqual(codes(r), ['T1', 'T2']);
  assert.equal(r.liens[0].signal.code, 'L1');
  assert.deepEqual(r.scenarios.map((s) => s.id), ['colis']);
});

test('faux impôts avec sous-domaine trompeur → très suspect', () => {
  const r = exemple('m2-faux-impots.txt');
  assert.equal(r.niveau, 'eleve');
  assert.equal(r.liens[0].signal.code, 'L2');
  assert.deepEqual(codes(r), ['T3', 'T5']); // 312,40 € n'est pas une « petite somme »
  assert.ok(r.scenarios.some((s) => s.id === 'impots'));
});

test('faux conseiller sans lien → très suspect (55)', () => {
  const r = exemple('m2-faux-conseiller.txt');
  assert.equal(r.score, 55);
  assert.equal(r.niveau, 'eleve');
  assert.deepEqual(codes(r), ['T1', 'T4']);
  assert.deepEqual(r.scenarios.map((s) => s.id), ['banque']);
});

test('CPF avec lien raccourci → suspect (40)', () => {
  const r = exemple('m2-cpf-raccourci.txt');
  assert.equal(r.score, 40);
  assert.equal(r.niveau, 'suspect');
  assert.equal(r.liens[0].signal.code, 'L5');
});

test('typosquatting + mot de passe → très suspect', () => {
  const r = exemple('m2-typosquatting.txt');
  assert.equal(r.niveau, 'eleve');
  assert.equal(r.liens[0].signal.code, 'L3');
  assert.deepEqual(codes(r), ['T1', 'T3']);
});

test('message légitime avec lien officiel → peu de signaux (10)', () => {
  const r = exemple('m2-legitime.txt');
  assert.equal(r.score, 10);
  assert.equal(r.niveau, 'faible');
  assert.equal(r.liens[0].officiel, 'La Poste / Colissimo');
});

test('plancher : lien imitant une marque + demande de paiement → au moins 70', () => {
  const r = analyserMessage('Payez ici : https://netflix-compte.test/');
  assert.equal(r.plancher, true);
  assert.equal(r.score, 70);
});

test('le résultat ne contient jamais le lien brut', () => {
  const r = exemple('m2-faux-colis.txt');
  assert.ok(!JSON.stringify(r).includes('https://laposte-suivi.test'));
});
