/**
 * Module 1 : analyse des en-têtes d'un mail (SPF, DKIM, DMARC).
 * Logique pure : reçoit du texte, renvoie un objet. Ne touche jamais au DOM.
 *
 * L'outil ne vérifie pas lui-même les signatures : il lit le résultat que la
 * messagerie du destinataire a noté dans l'en-tête Authentication-Results.
 */
import {
  domaineDe, domaineOrganisationnel, memeOrganisation, estPunycode,
  estMessagerieGratuite, extraireAdresse,
} from '../commun/domaines.js';
import { marqueEvoquee, estDomaineOfficiel } from '../commun/marques.js';

export const TAILLE_MAX = 200_000;

// Extensions de domaine recherchées dans un nom affiché (signal S4).
// Liste courte pour ne pas prendre « M.Dupont » pour un domaine.
const EXTENSIONS_COURANTES = new Set(['fr', 'com', 'net', 'org', 'eu', 'info', 'biz', 'io', 'be', 'ch', 'de', 'uk', 'es', 'it']);

/* ------------------------------------------------------------------ */
/* 1. Lecture brute des en-têtes                                       */
/* ------------------------------------------------------------------ */

/**
 * Découpe le texte en en-têtes { nom, valeur }.
 * - Les lignes qui commencent par un espace prolongent l'en-tête précédent (« dépliage »).
 * - La première ligne vide marque le début du corps : on s'arrête.
 * - Les lignes qui ne ressemblent pas à un en-tête sont ignorées.
 */
export function lireEnTetes(texte = '') {
  const lignes = String(texte).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const entetes = [];
  for (const ligne of lignes) {
    if (ligne.trim() === '') {
      if (entetes.length > 0) break; // fin des en-têtes
      continue; // lignes vides au début du collage
    }
    if (/^[ \t]/.test(ligne) && entetes.length > 0) {
      entetes[entetes.length - 1].valeur += ` ${ligne.trim()}`;
      continue;
    }
    // Nom d'en-tête : caractères imprimables sauf « : » (RFC 5322)
    const m = ligne.match(/^([\x21-\x39\x3b-\x7e]+):[ \t]*(.*)$/);
    if (m) entetes.push({ nom: m[1].toLowerCase(), valeur: m[2].trim() });
  }
  return entetes;
}

/**
 * Décode les « mots encodés » (RFC 2047) des noms affichés :
 * « =?UTF-8?Q?Cr=C3=A9dit_Agricole?= » → « Crédit Agricole ».
 * Sans ce décodage, un nom avec accents échapperait aux contrôles.
 */
export function decoderMotsEncodes(valeur = '') {
  return String(valeur)
    .replace(/(\?=)\s+(=\?)/g, '$1$2') // deux mots encodés qui se suivent sont collés
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (tout, jeu, encodage, texte) => {
      try {
        let octets;
        if (encodage.toLowerCase() === 'b') {
          octets = Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
        } else {
          const t = texte.replace(/_/g, ' ');
          const liste = [];
          for (let i = 0; i < t.length; i++) {
            const hexa = t.slice(i + 1, i + 3);
            if (t[i] === '=' && /^[0-9a-f]{2}$/i.test(hexa)) {
              liste.push(parseInt(hexa, 16));
              i += 2;
            } else {
              liste.push(t.charCodeAt(i));
            }
          }
          octets = Uint8Array.from(liste);
        }
        return new TextDecoder(jeu.split('*')[0]).decode(octets);
      } catch {
        return tout; // encodage inconnu : on laisse le texte tel quel
      }
    });
}

/** Découpe sur « ; » en ignorant ceux placés entre parenthèses (commentaires) ou guillemets. */
function decouperParties(valeur) {
  const parties = [];
  let courant = '';
  let profondeur = 0;
  let entreGuillemets = false;
  for (const c of valeur) {
    if (c === '"') entreGuillemets = !entreGuillemets;
    else if (!entreGuillemets && c === '(') profondeur++;
    else if (!entreGuillemets && c === ')' && profondeur > 0) profondeur--;

    if (c === ';' && profondeur === 0 && !entreGuillemets) {
      parties.push(courant.trim());
      courant = '';
    } else {
      courant += c;
    }
  }
  parties.push(courant.trim());
  return parties.filter(Boolean);
}

/**
 * Lit un en-tête Authentication-Results (RFC 8601).
 * Gmail  : « mx.google.com; dkim=pass header.i=@a.fr; spf=pass smtp.mailfrom=b@a.fr; dmarc=pass (p=REJECT) header.from=a.fr »
 * Microsoft : « spf=pass (sender IP is …) smtp.mailfrom=a.fr; dkim=pass header.d=a.fr; dmarc=pass action=none header.from=a.fr; compauth=pass reason=100 »
 * Renvoie { serveur, resultats: [{ methode, resultat, proprietes }] }.
 */
export function lireAuthResults(valeur = '') {
  let serveur = null;
  const resultats = [];
  decouperParties(valeur).forEach((partie, index) => {
    const m = partie.match(/^([a-z][a-z0-9_-]*)\s*=\s*([a-z]+)/i);
    if (!m) {
      // La première partie sans « = » est l'identifiant du serveur (absent chez Microsoft)
      if (index === 0) serveur = partie.split(/\s+/)[0] || null;
      return;
    }
    const proprietes = {};
    // Les commentaires sont lus aussi : Gmail y place la politique DMARC « (p=REJECT …) »
    const reste = partie.slice(m[0].length);
    for (const p of reste.matchAll(/([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)*)\s*=\s*("[^"]*"|[^\s;()]+)/gi)) {
      const cle = p[1].toLowerCase();
      if (!(cle in proprietes)) proprietes[cle] = p[2].replace(/^"|"$/g, '');
    }
    resultats.push({ methode: m[1].toLowerCase(), resultat: m[2].toLowerCase(), proprietes });
  });
  return { serveur, resultats };
}

/* ------------------------------------------------------------------ */
/* 2. Analyse complète                                                 */
/* ------------------------------------------------------------------ */

/** Domaines ou adresses visibles dans un nom affiché (« impots.gouv.fr », « a@b.fr »). */
function domainesDansNom(nom) {
  const trouves = [];
  for (const m of nom.matchAll(/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,})/gi)) {
    const avant = nom[m.index - 1];
    if (avant === '@' || EXTENSIONS_COURANTES.has(m[1].toLowerCase())) trouves.push(m[0].toLowerCase());
  }
  return trouves;
}

/**
 * Analyse les en-têtes collés et renvoie :
 * { statut: 'impossible' | 'authentique' | 'douteux' | 'usurpe', raison, expediteur,
 *   enveloppe, serveur, spf, dkim, dmarc, compauth, signaux: [{ code, niveau, texte }] }
 */
export function analyserEnTetes(texte = '') {
  const entetes = lireEnTetes(String(texte).slice(0, TAILLE_MAX));
  const premier = (nom) => entetes.find((e) => e.nom === nom)?.valeur;
  const tous = (nom) => entetes.filter((e) => e.nom === nom).map((e) => e.valeur);
  const signaux = [];
  const signaler = (code, niveau, texteSignal) => signaux.push({ code, niveau, texte: texteSignal });

  /* --- Règle 0 : il faut un expéditeur --- */
  const from = premier('from');
  const exp = extraireAdresse(decoderMotsEncodes(from ?? ''));
  const domaineFrom = exp.adresse.includes('@') ? domaineDe(exp.adresse) : '';
  if (!domaineFrom) {
    return { statut: 'impossible', raison: 'Aucune adresse d’expéditeur (champ From) n’a été trouvée.', signaux };
  }
  const orgFrom = domaineOrganisationnel(domaineFrom);

  /* --- Résultats d'authentification : seul le PREMIER en-tête est fiable --- */
  const listeAR = tous('authentication-results');
  const ar = listeAR.length > 0 ? lireAuthResults(listeAR[0]) : null;
  const resultat = (methode) => ar?.resultats.find((r) => r.methode === methode) ?? null;

  // SPF (secours : Received-SPF si Authentication-Results n'en parle pas)
  let spf = null;
  const spfAR = resultat('spf');
  const receivedSpf = premier('received-spf');
  if (spfAR) spf = { resultat: spfAR.resultat, source: spfAR.proprietes['smtp.mailfrom'] ?? '' };
  else if (receivedSpf) spf = { resultat: (receivedSpf.match(/^([a-z]+)/i)?.[1] ?? 'none').toLowerCase(), source: receivedSpf.match(/envelope-from=([^\s;]+)/i)?.[1] ?? '' };

  // Domaine de l'enveloppe (Return-Path), celui que SPF contrôle
  const returnPath = extraireAdresse(premier('return-path') ?? '').adresse;
  const domaineEnveloppe = domaineDe(spf?.source || returnPath);
  const spfAligne = spf?.resultat === 'pass' && memeOrganisation(domaineEnveloppe, domaineFrom);
  if (spf) spf = { resultat: spf.resultat, domaine: domaineEnveloppe, aligne: spfAligne };

  // DKIM : une ou plusieurs signatures
  const signaturesDkim = tous('dkim-signature').map((v) => domaineDe(v.match(/(?:^|;)\s*d=([^;\s]+)/i)?.[1] ?? ''));
  const dkim = (ar?.resultats ?? [])
    .filter((r) => r.methode === 'dkim')
    .map((r) => {
      let domaine = r.resultat === 'none' ? '' : domaineDe(r.proprietes['header.d'] ?? r.proprietes['header.i'] ?? '');
      if (!domaine && r.resultat !== 'none' && signaturesDkim.length === 1) domaine = signaturesDkim[0];
      return { resultat: r.resultat, domaine, aligne: r.resultat === 'pass' && memeOrganisation(domaine, domaineFrom) };
    });
  const dkimAligne = dkim.some((d) => d.aligne);

  // DMARC et évaluation composite de Microsoft
  const dmarcAR = resultat('dmarc');
  const dmarc = dmarcAR
    ? { resultat: dmarcAR.resultat, politique: (dmarcAR.proprietes.p ?? '').toLowerCase() || null }
    : null;
  const compauth = resultat('compauth')?.resultat ?? null;

  /* --- Incohérences (affichées quel que soit le verdict) --- */
  if (domaineEnveloppe && !memeOrganisation(domaineEnveloppe, domaineFrom)) {
    signaler('S1', 'info', `L'adresse technique d'envoi (${domaineEnveloppe}) n'est pas celle affichée (${domaineFrom}). C'est courant pour les newsletters envoyées par un prestataire, mais suspect si les vérifications échouent.`);
  }
  const dkimAutre = dkim.find((d) => d.resultat === 'pass' && d.domaine && !d.aligne);
  if (dkimAutre && !dkimAligne) {
    signaler('S2', 'info', `Le message est signé par ${dkimAutre.domaine}, pas par ${domaineFrom}.`);
  }
  const replyTo = domaineDe(extraireAdresse(premier('reply-to') ?? '').adresse);
  if (replyTo && !memeOrganisation(replyTo, domaineFrom)) {
    signaler('S3', 'attention', `Si vous répondez, votre réponse partira vers ${replyTo}, pas vers l'expéditeur affiché.`);
  }
  const imite = domainesDansNom(exp.nom).find((d) => !memeOrganisation(domaineDe(d), domaineFrom));
  if (imite) {
    signaler('S4', 'attention', `Le nom affiché imite une autre adresse (${domaineDe(imite)}) alors que le message vient de ${domaineFrom}.`);
  }
  if (listeAR.length > 1) {
    signaler('S5', 'info', "D'autres résultats d'authentification ont été ignorés : seul celui ajouté par votre messagerie est fiable.");
  }
  if (estPunycode(domaineFrom)) {
    signaler('S6', 'attention', "Ce domaine contient des caractères d'autres alphabets, parfois utilisés pour imiter un nom connu.");
  }
  if (estMessagerieGratuite(domaineFrom)) {
    signaler('S7', 'info', 'Envoyé depuis une messagerie grand public. Une banque ou une administration ne vous écrit pas depuis ce type d’adresse.');
  }
  const marque = marqueEvoquee(exp.nom) ?? marqueEvoquee(domaineFrom);
  if (marque && !estDomaineOfficiel(marque, domaineFrom)) {
    signaler('S8', 'attention', `Le message se présente comme venant de « ${marque.nom} », mais ${domaineFrom} ne fait pas partie des adresses officielles connues de cet organisme.`);
  }

  /* --- Verdict : la première règle qui correspond l'emporte --- */
  const sansDmarc = !dmarc || ['none', 'temperror', 'permerror'].includes(dmarc.resultat);
  const imitation = signaux.some((s) => ['S4', 'S6', 'S8'].includes(s.code));
  let statut;
  let raison;

  if (dmarc?.resultat === 'fail') {
    statut = 'usurpe';
    raison = `Votre messagerie indique un échec DMARC : le domaine ${domaineFrom} n'a pas autorisé ce message.`;
  } else if (compauth === 'fail') {
    statut = 'usurpe';
    raison = "L'évaluation de Microsoft (compauth) conclut que l'expéditeur affiché n'est pas authentifié.";
  } else if (sansDmarc && compauth !== 'pass' && spf?.resultat === 'fail' && !dkimAligne) {
    statut = 'usurpe';
    raison = "Le serveur d'envoi n'est pas autorisé (SPF en échec) et aucune signature DKIM ne confirme le domaine affiché.";
  } else if (!ar) {
    statut = 'douteux';
    raison = "Aucun résultat d'authentification n'a été trouvé : les en-têtes sont peut-être incomplets.";
  } else if (imitation) {
    statut = 'douteux';
    raison = 'Les vérifications techniques ne suffisent pas : un point relevé ci-dessous est typique des tentatives d’imitation.';
  } else if (dmarc?.resultat === 'pass' || dmarc?.resultat === 'bestguesspass') {
    statut = 'authentique';
    raison = `Votre messagerie a confirmé que le domaine affiché (${domaineFrom}) a autorisé ce message (DMARC réussi).`;
  } else if (compauth === 'pass') {
    statut = 'authentique';
    raison = "L'évaluation de Microsoft (compauth) confirme l'expéditeur affiché.";
  } else if (sansDmarc && (spfAligne || dkimAligne)) {
    statut = 'authentique';
    raison = `Une vérification (${dkimAligne ? 'DKIM' : 'SPF'}) confirme le domaine affiché, mais ce domaine n'a pas publié de règle DMARC.`;
  } else {
    statut = 'douteux';
    raison = 'Les vérifications ne confirment pas clairement le domaine affiché.';
  }

  return {
    statut,
    raison,
    expediteur: { nom: exp.nom, adresse: exp.adresse, domaine: domaineFrom, organisation: orgFrom },
    enveloppe: domaineEnveloppe || null,
    serveur: ar?.serveur ?? null,
    spf,
    dkim,
    dmarc,
    compauth,
    signaux,
  };
}
