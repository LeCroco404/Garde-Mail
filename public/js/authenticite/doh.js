/**
 * Module 1 : consultation du DNS par DNS-over-HTTPS (DoH).
 *
 * DoH = une requête DNS classique, transportée en HTTPS. Le navigateur peut donc
 * l'envoyer avec fetch(). Seul le NOM DE DOMAINE part vers le fournisseur,
 * jamais le contenu du message. Ces deux adresses sont les seules autorisées
 * par la CSP (connect-src) pour ce module.
 */

const FOURNISSEURS = [
  { nom: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { nom: 'Google', url: 'https://dns.google/resolve' }, // secours
];
const DELAI_MS = 5000;
const TYPE_TXT = 16; // code numérique du type d'enregistrement TXT

/** Un enregistrement TXT peut être découpé en morceaux entre guillemets : on les recolle. */
export function joindreTxt(data = '') {
  const morceaux = [...String(data).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  return morceaux.length > 0 ? morceaux.join('') : String(data);
}

export function domaineValide(domaine) {
  return typeof domaine === 'string' && domaine.length <= 253 && /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/i.test(domaine);
}

/** Demande les enregistrements TXT d'un nom. Essaie Cloudflare, puis Google. */
async function requeteTxt(nom) {
  let derniereErreur;
  for (const fournisseur of FOURNISSEURS) {
    try {
      const url = `${fournisseur.url}?name=${encodeURIComponent(nom)}&type=TXT`;
      const reponse = await fetch(url, {
        headers: { Accept: 'application/dns-json' }, // format JSON attendu par Cloudflare
        credentials: 'omit', // aucun cookie envoyé
        referrerPolicy: 'no-referrer', // le fournisseur ne voit pas d'où vient la requête
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const json = await reponse.json();
      // Status 0 = trouvé, 3 = le nom n'existe pas (réponse vide mais valable)
      if (json.Status !== 0 && json.Status !== 3) throw new Error(`DNS ${json.Status}`);
      const textes = (json.Answer ?? []).filter((a) => a.type === TYPE_TXT).map((a) => joindreTxt(a.data));
      return { fournisseur: fournisseur.nom, textes };
    } catch (erreur) {
      derniereErreur = erreur; // on tente le fournisseur suivant
    }
  }
  throw derniereErreur ?? new Error('DNS injoignable');
}

/** Explique un enregistrement SPF en langage simple. */
export function interpreterSpf(textes = []) {
  const spf = textes.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  if (spf.length === 0) {
    return { brut: null, niveau: 'attention', texte: "Ce domaine ne publie pas de SPF : il n'indique pas quels serveurs peuvent envoyer en son nom." };
  }
  if (spf.length > 1) {
    return { brut: spf.join('\n'), niveau: 'attention', texte: 'Ce domaine publie plusieurs SPF. C’est une erreur de configuration qui fait échouer les vérifications SPF.' };
  }
  const brut = spf[0].trim();
  const all = brut.match(/(?:^|\s)([-~?+]?)all(?:\s|$)/i);
  const redirect = brut.match(/(?:^|\s)redirect=(\S+)/i);
  if (all) {
    const textesAll = {
      '-': ['info', 'Règle stricte (-all) : les serveurs non listés doivent être refusés.'],
      '~': ['info', 'Règle tolérante (~all) : les serveurs non listés sont jugés suspects, sans être refusés.'],
      '?': ['attention', 'Règle neutre (?all) : le domaine ne se prononce pas sur les serveurs non listés.'],
      '+': ['attention', "Règle permissive (+all) : n'importe quel serveur est autorisé. Cela n'offre aucune protection."],
      '': ['attention', "Règle permissive (all) : n'importe quel serveur est autorisé. Cela n'offre aucune protection."],
    };
    const [niveau, texte] = textesAll[all[1]];
    return { brut, niveau, texte };
  }
  if (redirect) return { brut, niveau: 'info', texte: `Ce domaine applique la règle SPF de ${redirect[1]}.` };
  return { brut, niveau: 'attention', texte: 'Pas de règle finale : les serveurs non listés ne sont ni acceptés ni refusés.' };
}

/** Explique un enregistrement DMARC en langage simple. */
export function interpreterDmarc(textes = []) {
  const dmarc = textes.filter((t) => /^v=DMARC1\s*(;|$)/i.test(t.trim()));
  if (dmarc.length === 0) {
    return { brut: null, politique: null, niveau: 'attention', texte: 'Ce domaine ne publie pas de DMARC. Il ne protège pas son adresse : il est plus facile de l’imiter.' };
  }
  const brut = dmarc[0].trim();
  const balises = {};
  for (const morceau of brut.split(';')) {
    const [cle, ...valeur] = morceau.split('=');
    if (valeur.length) balises[cle.trim().toLowerCase()] = valeur.join('=').trim();
  }
  const politique = (balises.p ?? '').toLowerCase();
  const textesPolitique = {
    none: ['attention', 'Politique « none » : le domaine surveille les usurpations mais ne demande pas de les bloquer.'],
    quarantine: ['info', 'Politique « quarantine » : les messages qui échouent doivent être classés en indésirables.'],
    reject: ['info', 'Politique « reject » : les messages qui échouent doivent être refusés. C’est la protection la plus forte.'],
  };
  const [niveau, texte] = textesPolitique[politique] ?? ['attention', 'Politique DMARC absente ou invalide.'];
  return { brut, politique: politique || null, niveau, texte };
}

/**
 * Consulte SPF et DMARC d'un domaine.
 * DMARC : on cherche _dmarc.<domaine>, puis _dmarc.<domaine organisationnel>
 * (un sous-domaine hérite de la règle de son domaine parent).
 */
export async function consulterDomaine(domaine, organisation = domaine) {
  if (!domaineValide(domaine)) throw new Error('Nom de domaine invalide');
  const [repSpf, repDmarc] = await Promise.all([requeteTxt(domaine), requeteTxt(`_dmarc.${domaine}`)]);
  const fournisseurs = new Set([repSpf.fournisseur, repDmarc.fournisseur]);

  let textesDmarc = repDmarc.textes;
  let domaineDmarc = domaine;
  const aUnDmarc = (liste) => liste.some((t) => /^v=DMARC1/i.test(t.trim()));
  if (!aUnDmarc(textesDmarc) && organisation && organisation !== domaine && domaineValide(organisation)) {
    const repParent = await requeteTxt(`_dmarc.${organisation}`);
    fournisseurs.add(repParent.fournisseur);
    textesDmarc = repParent.textes;
    domaineDmarc = organisation;
  }

  return {
    fournisseurs: [...fournisseurs],
    spf: { domaine, ...interpreterSpf(repSpf.textes) },
    dmarc: { domaine: domaineDmarc, ...interpreterDmarc(textesDmarc) },
  };
}
