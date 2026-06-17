# La Course à la Viralité 🚀

Jeu navigateur type **Jetpack Joyride** sur le thème des réseaux sociaux, aux couleurs de
la formation **Marketing & Communication — Ynov**.
L'avatar avance tout seul dans une ville numérique : **maintiens** pour t'envoler,
attrape ❤️ et 🧑 (followers +), évite 🐛 😡 💢 (followers −), fonce sur 🔥 (× 2 + accélération).
Enchaîne les bons objets sans te cogner pour faire monter la **SÉRIE ×2 → ×5** (gains multipliés),
et célèbre les paliers (100, 250, 500… followers).
Quand le temps est écoulé, le compteur de followers se fige : **c'est ton score = ton XP** —
que tu peux ensuite **partager** en un clic.

**Victoire & Défi Campagne.** Atteindre **2000 followers** déclenche la victoire et débloque
le **Défi Campagne** : un brief unique (« lancer un nouveau produit auprès des jeunes ») et
4 choix guidés par cartes (cible → idée → canal → créateur/message). À la fin, la campagne
s'affiche sous forme d'un **faux post social animé** construit à partir des choix, avec un
verdict en étoiles. *(Astuce démo : depuis le menu/fin, la touche `C` ouvre directement le défi.)*

Le jeu est **jouable sur mobile** (tactile, mise en page responsive : cartes empilées, défi en grille adaptative).

## Deux parcours

| Parcours | Profil | Esprit |
|---|---|---|
| **1 · Découverte** | Post-Bac, 1ʳᵉ année | Rassurant et guidé : tempo posé, pénalités allégées, conseils en jeu |
| **2 · Maîtrise** | 3ᵉ année / admission parallèle | Exigeant et valorisant : rythme nerveux, pénalités réelles, récompenses + 20 % |

## Lancer le jeu

- **Le plus simple :** double-clique sur `index.html` (s'ouvre dans le navigateur, aucune installation).
- **Ou via un serveur local** (recommandé si la police web ne charge pas en `file://`) :
  ```bash
  cd "/Users/axel/Documents/Jeu"
  python3 -m http.server 8000
  # puis ouvre http://localhost:8000
  ```

## Commande

Une seule : **maintenir** clic / doigt / `Espace` → monter · **relâcher** → descendre.
`M` coupe le son.

## Sous le capot

- 100 % **HTML + CSS + Canvas 2D + JavaScript vanilla**, zéro dépendance, zéro build.
- `index.html` — structure (menu, HUD, écran de fin) · `style.css` — thème néon · `game.js` — moteur.
- Repère logique fixe 1000 × 600 mis à l'échelle (net sur tout écran, responsive).
- Meilleurs scores conservés par parcours dans le `localStorage`.

> La police *Outfit* est chargée depuis Google Fonts ; hors-ligne, le jeu retombe
> automatiquement sur les polices système. Aucun autre appel réseau.
