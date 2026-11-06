/**
 * Module 2 : détection des signaux d'arnaque dans un SMS ou un mail.
 * Logique pure : reçoit du texte, renvoie un objet. Ne touche jamais au DOM,
 * n'ouvre aucun lien et n'envoie rien sur le réseau.
 */
import { domaineOrganisationnel, estPunycode, defanger } from '../commun/domaines.js';
import { MARQUES, marqueEvoquee, estDomaineOfficiel } from '../commun/marques.js';
import {
  SEUILS, PLANCHER_COMBINAISON, POINTS_SCENARIO, SIGNAUX_LIENS, RACCOURCISSEURS,
  EXTENSIONS_NUES, HOMOGLYPHES, REFERENCES_EXCLUES, SIGNAUX_TEXTE, SCENARIOS,
} from './regles.js';

export const TAILLE_MAX = 50_000;

/* ------------------------------------------------------------------ */
/* 1. Normalisation du texte                                           */
/* ------------------------------------------------------------------ */

/**
 * Minuscules, sans accents, espaces et apostrophes unifiés.
 * Le résultat a EXACTEMENT la même longueur que l'entrée : une position trouvée
 * dans le texte normalisé sert à extraire la preuve dans le texte d'origine.
 */
export function normaliserTexte(texte = '') {
  let sortie = '';
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (c === ' ' || c === ' ') { sortie += ' '; continue; } // espaces insécables
    if (c === '’' || c === '‘') { sortie += "'"; continue; } // apostrophes typographiques
    const base = c.normalize('NFD')[0]; // « é » → « e »
    const minuscule = base.toLowerCase();
    sortie += minuscule.length === 1 ? minuscule : base;
  }
  return sortie;
}

/* ------------------------------------------------------------------ */
/* 2. Extraction des liens                                             */
/* ------------------------------------------------------------------ */

const FIN_LIEN = /[\s<>"'«»]/u;
const MOTIFS_LIENS = [
  /https?:\/\/[^\s<>"'«»]+/giu,
  /www\.[^\s<>"'«»]+/giu,
  // Domaine nu (« suivi-colis.fr/ab12 »), avec ou sans chemin
  /(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}{2,24}(?:\/[^\s<>"'«»]*)?/giu,
];

/** Lit le nom d'hôte d'un lien (en minuscules, caractères non latins convertis en punycode). */
function lireHote(brut) {
  try {
    const url = new URL(/^https?:\/\//i.test(brut) ? brut : `http://${brut}`);
    return url.hostname.replace(/\.$/, '');
  } catch {
    return null;
  }
}

/** Renvoie les liens trouvés dans le texte : [{ brut, affiche, hote }], sans doublon d'hôte. */
export function extraireLiens(texte = '') {
  const occupes = []; // portions déjà reconnues, pour ne pas compter deux fois le même lien
  const liens = [];
  const dejaVus = new Set();

  MOTIFS_LIENS.forEach((motif, indexMotif) => {
    for (const m of texte.matchAll(motif)) {
      const debut = m.index;
      const precedent = texte[debut - 1] ?? ' ';
      // Le lien doit commencer après un séparateur (pas au milieu d'un mot ni d'une adresse mail)
      if (!FIN_LIEN.test(precedent) && !/[(\[:;,]/.test(precedent)) continue;
      const brut = m[0].replace(/[.,;:!?)\]}’»]+$/u, ''); // ponctuation finale
      const fin = debut + brut.length;
      if (occupes.some(([d, f]) => debut < f && fin > d)) continue;

      if (indexMotif === 2) {
        // Domaine nu : accepté s'il a un chemin, ou si son extension est courante
        const aUnChemin = brut.includes('/');
        const extension = brut.split('/')[0].split('.').pop().toLowerCase();
        if (!aUnChemin && !EXTENSIONS_NUES.has(extension)) continue;
      }

      const hote = lireHote(brut);
      if (!hote) continue;
      occupes.push([debut, fin]);
      if (dejaVus.has(hote)) continue;
      dejaVus.add(hote);
      liens.push({ brut, affiche: defanger(brut), hote, position: debut });
    }
  });
  return liens.sort((a, b) => a.position - b.position).map(({ position, ...lien }) => lien);
}

/* ------------------------------------------------------------------ */
/* 3. Analyse d'un lien                                                */
/* ------------------------------------------------------------------ */

/** Distance entre deux mots : insertions, suppressions, substitutions et inversions de deux lettres. */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function remplacerHomoglyphes(mot) {
  return HOMOGLYPHES.reduce((m, [faux, vrai]) => m.split(faux).join(vrai), mot);
}

/* Étiquettes de référence pour la détection de fautes volontaires : « paypal », « laposte »… */
const REFERENCES = [];
for (const marque of MARQUES) {
  for (const domaine of marque.domaines) {
    const etiquette = domaine.split('.')[0];
    if (etiquette.length >= 5 && !REFERENCES_EXCLUES.has(etiquette)) {
      REFERENCES.push({ etiquette, domaine, marque });
    }
  }
}

/** Cherche une faute volontaire (paypa1, amazom, lapostte) dans les morceaux d'un nom d'hôte. */
function chercherTyposquatting(hote) {
  const morceaux = new Set([...hote.split('.'), ...hote.split(/[.-]/)]);
  for (const morceau of morceaux) {
    for (const ref of REFERENCES) {
      if (morceau === ref.etiquette) continue;
      const parHomoglyphe = morceau.length >= 5 && remplacerHomoglyphes(morceau) === ref.etiquette;
      // Une seule lettre de différence, seulement pour les marques de 6 lettres ou plus
      // (sinon « apply » serait pris pour « apple »)
      const parFaute = ref.etiquette.length >= 6 && distance(morceau, ref.etiquette) === 1;
      if (parHomoglyphe || parFaute) return { morceau, ref };
    }
  }
  return null;
}

/**
 * Analyse un nom d'hôte. Renvoie { officiel: nom de marque | null, signal: { code, points, texte } | null }.
 * Si plusieurs signaux s'appliquent, seul le plus fort est gardé.
 */
export function analyserLien(hote) {
  const organisation = domaineOrganisationnel(hote);

  // Domaine officiel connu : aucun signal
  for (const marque of MARQUES) {
    if (estDomaineOfficiel(marque, hote)) return { officiel: marque.nom, signal: null };
  }

  const candidats = [];
  const ajouter = (code, texte) => candidats.push({ code, points: SIGNAUX_LIENS[code].points, texte });

  // L2 : domaine officiel complet placé devant un autre domaine
  for (const marque of MARQUES) {
    const leurre = marque.domaines.find((o) => o.includes('.') && (hote.startsWith(`${o}.`) || hote.includes(`.${o}.`)));
    if (leurre) {
      ajouter('L2', `L'adresse commence par ${defanger(leurre)}, mais le vrai site est ${defanger(organisation)}. C'est la fin de l'adresse qui compte.`);
      break;
    }
  }

  // L3 : faute volontaire
  const typo = chercherTyposquatting(hote);
  if (typo) ajouter('L3', `Ce domaine imite ${defanger(typo.ref.domaine)} avec une faute volontaire (« ${typo.morceau} »).`);

  // L1 : nom de marque dans un domaine non officiel
  const marque = marqueEvoquee(hote);
  if (marque) ajouter('L1', `Ce lien évoque « ${marque.nom} » mais ne mène pas à un site officiel de cet organisme.`);

  // L6 : adresse IP
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hote) || hote.startsWith('[')) {
    ajouter('L6', 'Ce lien pointe vers une adresse numérique, ce qu’un organisme officiel ne fait pas.');
  }

  // L4 : caractères d'autres alphabets
  if (estPunycode(hote)) ajouter('L4', 'Ce lien contient des caractères d’autres alphabets qui peuvent imiter des lettres latines.');

  // L5 : raccourcisseur
  if (RACCOURCISSEURS.has(organisation)) ajouter('L5', 'Ce lien raccourci cache sa vraie destination.');

  // Le plus fort ; à égalité, l'ordre d'ajout ci-dessus décide
  const signal = candidats.reduce((max, c) => (max && max.points >= c.points ? max : c), null);
  return { officiel: null, signal };
}

/* ------------------------------------------------------------------ */
/* 4. Analyse complète                                                 */
/* ------------------------------------------------------------------ */

/**
 * Analyse un SMS ou un mail. Renvoie :
 * { score, niveau: 'faible' | 'suspect' | 'eleve', liens, signaux, scenarios, detail, plancher }
 */
export function analyserMessage(texteBrut = '') {
  const original = String(texteBrut).slice(0, TAILLE_MAX).normalize('NFC');
  const texte = normaliserTexte(original);

  // Liens
  const liens = extraireLiens(original).map((lien) => ({ ...lien, ...analyserLien(lien.hote) }));

  // Signaux du texte : chacun compte une fois, avec jusqu'à trois expressions en preuve
  const signaux = [];
  for (const regle of SIGNAUX_TEXTE) {
    const preuves = new Map(); // clé : forme normalisée, pour ne pas afficher « Remboursement » et « remboursement »
    for (const motif of regle.motifs) {
      for (const m of texte.matchAll(motif)) {
        const cle = m[0].trim();
        if (!preuves.has(cle)) preuves.set(cle, original.slice(m.index, m.index + m[0].length).trim());
      }
    }
    if (preuves.size > 0) {
      signaux.push({ code: regle.code, points: regle.points, texte: regle.texte, preuves: [...preuves.values()].slice(0, 3) });
    }
  }

  // Scénarios connus
  const scenarios = SCENARIOS.filter((s) => s.motif.test(texte))
    .map(({ id, nom, conseil, source }) => ({ id, nom, conseil, source }));

  // Score
  const detail = [];
  for (const lien of liens) {
    if (lien.signal) detail.push({ libelle: `Lien ${lien.affiche}`, points: lien.signal.points });
  }
  for (const s of signaux) detail.push({ libelle: s.texte, points: s.points });
  if (scenarios.length > 0 && liens.length > 0) {
    detail.push({ libelle: 'Scénario d’arnaque connu, accompagné d’un lien', points: POINTS_SCENARIO });
  }
  let score = detail.reduce((total, d) => total + d.points, 0);

  // Règle de sécurité : lien qui imite une marque + demande de paiement, de données ou de code
  const lienImitant = liens.some((l) => ['L1', 'L2', 'L3', 'L4'].includes(l.signal?.code));
  const demandeSensible = signaux.some((s) => ['T2', 'T3', 'T4'].includes(s.code));
  const plancher = lienImitant && demandeSensible && score < PLANCHER_COMBINAISON;
  if (plancher) score = PLANCHER_COMBINAISON;
  score = Math.min(100, score);

  const niveau = score >= SEUILS.eleve ? 'eleve' : score >= SEUILS.suspect ? 'suspect' : 'faible';
  return {
    score,
    niveau,
    liens: liens.map(({ brut, ...lien }) => lien), // le lien brut n'est jamais renvoyé : seule la version défangée sert à l'affichage
    signaux,
    scenarios,
    detail,
    plancher,
  };
}
