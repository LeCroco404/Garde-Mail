/**
 * Outils communs sur les adresses mail et les noms de domaine.
 * Fonctions pures : aucune dépendance au navigateur, testables avec Node.
 */

// Suffixes publics à deux niveaux les plus courants. Sous ces suffixes, le
// domaine « enregistrable » compte trois étiquettes (impots.gouv.fr, bbc.co.uk).
// Extrait volontairement court de la Public Suffix List (https://publicsuffix.org) :
// pour un suffixe absent de cette liste, le domaine organisationnel calculé
// est trop court (limite documentée dans le README).
const SUFFIXES_DOUBLES = new Set([
  'gouv.fr', 'asso.fr', 'com.fr', 'nom.fr', 'tm.fr', 'presse.fr',
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.za', 'co.in', 'co.kr',
  'com.br', 'com.mx', 'com.tr', 'com.cn', 'com.sg', 'com.hk', 'gc.ca',
]);

// Messageries grand public : n'importe qui peut y créer une adresse.
const MESSAGERIES_GRATUITES = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com',
  'hotmail.fr', 'live.com', 'live.fr', 'msn.com', 'yahoo.com', 'yahoo.fr',
  'icloud.com', 'me.com', 'mac.com', 'orange.fr', 'wanadoo.fr', 'free.fr',
  'sfr.fr', 'neuf.fr', 'laposte.net', 'gmx.fr', 'gmx.com', 'aol.com',
  'proton.me', 'protonmail.com',
]);

/** Met un domaine en minuscules et retire les caractères parasites (@, points, chevrons). */
export function normaliserDomaine(domaine = '') {
  return String(domaine).trim().toLowerCase().replace(/^[@.<]+|[.>]+$/g, '');
}

/** Renvoie le domaine d'une adresse (« a@b.fr » → « b.fr »), ou la valeur elle-même si c'est déjà un domaine. */
export function domaineDe(valeur = '') {
  const v = String(valeur).trim();
  const i = v.lastIndexOf('@');
  return normaliserDomaine(i >= 0 ? v.slice(i + 1) : v);
}

/**
 * Domaine organisationnel : la partie achetée auprès d'un registre.
 * « mail.banque.fr » → « banque.fr », « dgfip.finances.gouv.fr » → « finances.gouv.fr ».
 */
export function domaineOrganisationnel(domaine = '') {
  const etiquettes = normaliserDomaine(domaine).split('.').filter(Boolean);
  if (etiquettes.length <= 2) return etiquettes.join('.');
  const n = SUFFIXES_DOUBLES.has(etiquettes.slice(-2).join('.')) ? 3 : 2;
  return etiquettes.slice(-n).join('.');
}

/** Vrai si deux domaines appartiennent à la même organisation (alignement souple DMARC). */
export function memeOrganisation(a, b) {
  const oa = domaineOrganisationnel(a);
  return oa !== '' && oa === domaineOrganisationnel(b);
}

/** Vrai si le domaine contient une étiquette punycode (caractères non latins encodés). */
export function estPunycode(domaine) {
  return normaliserDomaine(domaine).split('.').some((e) => e.startsWith('xn--'));
}

export function estMessagerieGratuite(domaine) {
  return MESSAGERIES_GRATUITES.has(domaineOrganisationnel(domaine));
}

/**
 * Sépare le nom affiché et l'adresse d'un champ comme
 * « "Service client" <contact@exemple.fr> ».
 * On prend le DERNIER <...> : un nom affiché peut lui-même contenir une fausse adresse.
 */
export function extraireAdresse(valeur = '') {
  const v = String(valeur).trim();
  const chevrons = v.match(/<([^<>]*)>\s*$/);
  if (chevrons) {
    const nom = v.slice(0, chevrons.index).trim().replace(/^"(.*)"$/, '$1').trim();
    return { nom, adresse: chevrons[1].trim() };
  }
  const seule = v.match(/[^\s<>"]+@[^\s<>"]+/);
  return { nom: '', adresse: seule ? seule[0] : '' };
}

/** Rend un lien inoffensif à l'affichage : « https://a.fr » → « hxxps://a[.]fr ». */
export function defanger(texte = '') {
  return String(texte).replace(/^(h)tt(p)/i, '$1xx$2').replace(/\./g, '[.]');
}
