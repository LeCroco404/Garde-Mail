/**
 * Organismes et marques souvent imités, avec leurs domaines officiels.
 * Partagé par le module 1 (expéditeur) et le module 2 (liens), qui complétera la liste.
 *
 * Règle de prudence : un domaine n'est ajouté que s'il est certain. Une messagerie
 * gratuite (laposte.net, icloud.com…) n'est jamais considérée comme officielle,
 * puisque n'importe qui peut y créer une adresse.
 */
import { normaliserDomaine, estMessagerieGratuite } from './domaines.js';

export const MARQUES = [
  { nom: 'Impots.gouv (DGFiP)', motsCles: ['impots', 'dgfip', 'finances publiques'], domaines: ['impots.gouv.fr', 'finances.gouv.fr'] },
  { nom: 'Assurance Maladie (Ameli)', motsCles: ['ameli', 'assurance maladie', 'cpam'], domaines: ['ameli.fr'] },
  { nom: 'CAF', motsCles: ['caf'], domaines: ['caf.fr'] },
  { nom: 'ANTAI (amendes)', motsCles: ['antai'], domaines: ['antai.gouv.fr'] },
  { nom: 'Mon Compte Formation (CPF)', motsCles: ['cpf', 'moncompteformation', 'compte formation'], domaines: ['moncompteformation.gouv.fr'] },
  { nom: 'France Travail', motsCles: ['france travail', 'pole emploi'], domaines: ['francetravail.fr', 'pole-emploi.fr'] },
  { nom: 'La Poste / Colissimo', motsCles: ['la poste', 'laposte', 'colissimo'], domaines: ['laposte.fr', 'colissimo.fr'] },
  { nom: 'Chronopost', motsCles: ['chronopost'], domaines: ['chronopost.fr'] },
  { nom: 'La Banque Postale', motsCles: ['banque postale'], domaines: ['labanquepostale.fr'] },
  { nom: 'Crédit Agricole', motsCles: ['credit agricole'], domaines: ['credit-agricole.fr', 'credit-agricole.com'] },
  { nom: 'Société Générale', motsCles: ['societe generale'], domaines: ['societegenerale.fr', 'societegenerale.com'] },
  { nom: 'BNP Paribas', motsCles: ['bnp', 'bnp paribas'], domaines: ['bnpparibas.com', 'bnpparibas.fr', 'bnpparibas'] },
  { nom: "Caisse d'Épargne", motsCles: ['caisse d epargne', 'caisse epargne'], domaines: ['caisse-epargne.fr'] },
  { nom: 'LCL', motsCles: ['lcl'], domaines: ['lcl.fr'] },
  { nom: 'PayPal', motsCles: ['paypal'], domaines: ['paypal.com', 'paypal.fr'] },
  { nom: 'Amazon', motsCles: ['amazon'], domaines: ['amazon.fr', 'amazon.com'] },
  { nom: 'Netflix', motsCles: ['netflix'], domaines: ['netflix.com'] },
  { nom: 'Apple', motsCles: ['apple'], domaines: ['apple.com'] },
  { nom: 'Microsoft', motsCles: ['microsoft'], domaines: ['microsoft.com'] },
];

/** Découpe un texte en mots sans accents ni majuscules : « Crédit-Agricole.fr » → ["credit", "agricole", "fr"]. */
export function mots(texte = '') {
  return String(texte)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Vrai si la suite de mots `suite` apparaît telle quelle, à la suite, dans `liste`. */
function contientSuite(liste, suite) {
  for (let i = 0; i + suite.length <= liste.length; i++) {
    if (suite.every((m, j) => liste[i + j] === m)) return true;
  }
  return false;
}

/**
 * Renvoie la marque évoquée par un texte (nom affiché ou domaine), ou null.
 * On compare des mots entiers pour éviter les faux positifs (« camelia » ne contient pas « ameli »).
 * Les mots collés sont aussi reconnus : « creditagricole » ou « laposte ».
 */
export function marqueEvoquee(texte) {
  const liste = mots(texte);
  if (liste.length === 0) return null;
  for (const marque of MARQUES) {
    for (const cle of marque.motsCles) {
      const suite = mots(cle);
      if (contientSuite(liste, suite) || liste.includes(suite.join(''))) return marque;
    }
  }
  return null;
}

/** Vrai si `domaine` est un domaine officiel de la marque (ou l'un de ses sous-domaines). */
export function estDomaineOfficiel(marque, domaine) {
  const d = normaliserDomaine(domaine);
  if (estMessagerieGratuite(d)) return false;
  return marque.domaines.some((officiel) => d === officiel || d.endsWith(`.${officiel}`));
}
