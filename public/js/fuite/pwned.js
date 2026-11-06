/**
 * Module 3 : vérification d'un mot de passe avec Pwned Passwords, en k-anonymat.
 *
 * 1. Le navigateur calcule l'empreinte SHA-1 du mot de passe (40 caractères hexadécimaux).
 * 2. Seuls les 5 PREMIERS caractères sont envoyés au service.
 * 3. Le service renvoie toutes les fins d'empreinte connues qui commencent ainsi.
 * 4. La comparaison se fait ici : le service ne sait jamais quel mot de passe a été vérifié.
 *
 * Ni le mot de passe ni l'empreinte complète ne quittent le navigateur.
 */

const API = 'https://api.pwnedpasswords.com/range/';
const DELAI_MS = 8000;

/** Levée quand crypto.subtle est absent (page ouverte hors HTTPS et hors localhost). */
export class ContexteNonSecurise extends Error {}

/** Empreinte SHA-1 d'un texte, en majuscules (« password » → « 5BAA61E4… »). */
export async function empreinteSha1(texte) {
  if (!globalThis.crypto?.subtle) throw new ContexteNonSecurise('crypto.subtle indisponible');
  const octets = new TextEncoder().encode(texte); // UTF-8, comme la base Pwned Passwords
  const hache = await crypto.subtle.digest('SHA-1', octets);
  return [...new Uint8Array(hache)]
    .map((octet) => octet.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Cherche une fin d'empreinte dans la réponse du service (« SUFFIXE:NOMBRE » par ligne).
 * Les lignes de remplissage (padding) ont un nombre à 0 : elles ne comptent pas.
 */
export function compterDansReponse(reponse, suffixe) {
  for (const ligne of reponse.split(/\r?\n/)) {
    const [fin, nombre] = ligne.trim().split(':');
    if (fin === suffixe) {
      const n = Number.parseInt(nombre, 10);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

/**
 * Vérifie un mot de passe. Renvoie { prefixe, nombre } : nombre = 0 si absent des fuites connues.
 * `options.fetch` permet de remplacer fetch dans les tests.
 */
export async function verifierMotDePasse(motDePasse, options = {}) {
  const requete = options.fetch ?? globalThis.fetch;
  const empreinte = await empreinteSha1(motDePasse);
  const prefixe = empreinte.slice(0, 5);
  const suffixe = empreinte.slice(5);

  const reponse = await requete(`${API}${prefixe}`, {
    headers: { 'Add-Padding': 'true' }, // de fausses lignes masquent la taille réelle de la réponse
    credentials: 'omit', // aucun cookie
    referrerPolicy: 'no-referrer', // le service ne voit pas d'où vient la requête
    cache: 'no-store', // la réponse n'est pas gardée dans le cache du navigateur
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);

  return { prefixe, nombre: compterDansReponse(await reponse.text(), suffixe) };
}
