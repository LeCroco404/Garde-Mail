// Tests des outils communs : node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  domaineDe, domaineOrganisationnel, memeOrganisation, estPunycode,
  estMessagerieGratuite, extraireAdresse, defanger,
} from '../public/js/commun/domaines.js';
import { marqueEvoquee, estDomaineOfficiel } from '../public/js/commun/marques.js';

test('domaine organisationnel', () => {
  assert.equal(domaineOrganisationnel('mail.example.com'), 'example.com');
  assert.equal(domaineOrganisationnel('dgfip.finances.gouv.fr'), 'finances.gouv.fr');
  assert.equal(domaineOrganisationnel('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(domaineOrganisationnel('Example.COM.'), 'example.com');
});

test('alignement souple', () => {
  assert.ok(memeOrganisation('mail.example.com', 'example.com'));
  assert.ok(!memeOrganisation('example.net', 'example.com'));
  assert.ok(!memeOrganisation('', ''));
});

test('extraction de l’adresse et du nom affiché', () => {
  assert.deepEqual(extraireAdresse('"Service client" <contact@example.com>'), { nom: 'Service client', adresse: 'contact@example.com' });
  assert.deepEqual(extraireAdresse('contact@example.com'), { nom: '', adresse: 'contact@example.com' });
  // Le dernier <...> est la vraie adresse, même si le nom en contient une fausse
  assert.equal(extraireAdresse('"a <x@impots.gouv.fr>" <y@example.net>').adresse, 'y@example.net');
  assert.equal(domaineDe('<a@Mail.Example.com>'), 'mail.example.com');
});

test('punycode, messageries gratuites, défangage', () => {
  assert.ok(estPunycode('xn--pypal-4ve.com'));
  assert.ok(!estPunycode('paypal.com'));
  assert.ok(estMessagerieGratuite('gmail.com'));
  assert.ok(!estMessagerieGratuite('example.com'));
  assert.equal(defanger('https://exemple.com/a'), 'hxxps://exemple[.]com/a');
});

test('marques : mots entiers, accents, mots collés', () => {
  assert.equal(marqueEvoquee('Crédit Agricole')?.nom, 'Crédit Agricole');
  assert.equal(marqueEvoquee('laposte-suivi.example.net')?.nom, 'La Poste / Colissimo');
  assert.equal(marqueEvoquee('Camelia Fleurs'), null); // « ameli » n'est pas un mot entier ici
  assert.equal(marqueEvoquee('Exemple Banque'), null);
});

test('domaines officiels', () => {
  const ameli = marqueEvoquee('ameli');
  assert.ok(estDomaineOfficiel(ameli, 'ameli.fr'));
  assert.ok(estDomaineOfficiel(ameli, 'info.ameli.fr'));
  assert.ok(!estDomaineOfficiel(ameli, 'ameli-remboursement.example.net'));
  const poste = marqueEvoquee('La Poste');
  assert.ok(!estDomaineOfficiel(poste, 'laposte.net')); // messagerie gratuite, jamais officielle
});
