/**
 * Création d'éléments HTML sans risque.
 * Tout texte passe par textContent ou append(chaîne) : il est affiché tel quel,
 * jamais interprété comme du HTML. Ne JAMAIS utiliser innerHTML avec du contenu collé.
 */

/**
 * creer('p', { classe: 'aide', texte: 'Bonjour' })
 * creer('ul', {}, [creer('li', { texte: 'un' })])
 * Les enfants peuvent être des éléments ou des chaînes (converties en texte).
 */
export function creer(balise, options = {}, enfants = []) {
  const element = document.createElement(balise);
  if (options.classe) element.className = options.classe;
  if (options.texte != null) element.textContent = options.texte;
  for (const [nom, valeur] of Object.entries(options.attributs ?? {})) {
    element.setAttribute(nom, valeur);
  }
  for (const enfant of enfants) {
    if (enfant != null && enfant !== false) element.append(enfant);
  }
  return element;
}

/** Vide un conteneur. */
export function vider(element) {
  element.replaceChildren();
}
