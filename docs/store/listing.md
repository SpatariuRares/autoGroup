# Chrome Web Store listing

Texts to paste into the developer dashboard ("Store listing" tab), per language.

**No lists of brand names in the description.** The first version was rejected on 5 October 2026 ("Yellow Argon" violation, *excessive keywords*) because of the lists of product names ("Ollama, LM Studio, Unsloth Studio", "OpenRouter", "Jev, Kev, Rizzo Flow"). Each option must be described by what it does; the provider names belong in the extension and in the README. Name and summary already come from the manifest (`extName`, `extDescription` in `public/_locales`); the detailed description is written in the dashboard for each language.

- **Category**: Productivity → Workflow & Planning (*Produttività → Flusso di lavoro e pianificazione*).
- **Languages**: Italian (default language of the manifest), English, Spanish, French and German. The detailed description below exists in all five languages; the screenshots exist in Italian and English (use the English ones for Spanish, French and German).
- **Images**: `docs/store/<language>/screenshot-1…4.png` (1280×800), `docs/store/<language>/promo-small.png` (440×280), icon `docs/store/icon-128.png`. Regenerate them with `npm run store-assets`.
- **Website / support**: to fill in if you publish the repository or a project page.
- **Privacy policy**: the URL of the page published from [privacy.md](privacy.md).

## Italian

**Nome** (from the manifest): autoGroup – AI Tab Groups

**Riepilogo** (from the manifest, 65 characters out of 132): Raggruppa le tab con l'AI che scegli tu, con anteprima e annulla.

**Descrizione dettagliata**:

```text
Troppe tab aperte? autoGroup le divide in gruppi di Chrome, per sito o per argomento, e ti mostra la proposta prima di spostare le tab (tranne quelle dei siti che metti in una categoria, che puoi far raggruppare in automatico).

COME FUNZIONA
• Clicchi l'icona (o premi Alt+Shift+G) e si apre il pannello laterale con la proposta per la finestra.
• Controlli e modifichi i gruppi: rinomina, colore, sposta o togli una tab, scarta un gruppo.
• Premi «Applica» e i gruppi vengono creati. «Annulla» rimette tutto com'era.
Nessuna tab si muove senza la tua conferma, tranne quelle dei siti che metti tu in una categoria: vanno subito nel loro gruppo (si può spegnere).

DUE MODALITÀ
• Per sito: le tab dello stesso sito nello stesso gruppo. Immediato, nessuna configurazione, nessun dato esce dal computer.
• Con l'AI: le tab divise per argomento, tra le tue categorie o in gruppi nuovi proposti dall'AI. I gruppi già aperti vengono estesi con le tab che c'entrano.
• In entrambe: metti un sito in una categoria e le sue tab ci finiscono sempre, anche da sole mentre navighi (si può spegnere).

L'AI LA SCEGLI TU
• Il modello integrato in Chrome, se il tuo computer lo supporta: gratis, senza chiavi, nessun dato esce dal computer.
• Un modello che gira sul tuo computer.
• Un servizio online compatibile con le API di OpenAI, con la tua chiave.
• Facoltativo: un classificatore veloce che assegna le tab alle tue categorie.
Se l'AI non risponde si passa al raggruppamento per sito: una proposta arriva sempre. Mentre l'AI lavora vedi già la proposta per sito, e con «Usa questa» non aspetti.

PRIVACY
• Nessun server dello sviluppatore, nessuna statistica.
• All'AI arrivano solo titolo e indirizzo ripulito delle tab (senza parametri), mai le tab fissate, già raggruppate o dei domini che escludi.
• La lettura della descrizione delle pagine è facoltativa e chiede il permesso solo quando la accendi.
• Le chiavi API restano su questo computer.

Segnala le tab aperte due volte e quelle che non apri da una settimana, mostra quali chiuderebbe e chiude quelle che confermi. Dal pannello vai a una tab, ne togli l'audio, comprimi o chiudi un gruppo. Esporta e importa le impostazioni in un file.

Una guida al primo avvio ti aiuta a scegliere modalità e provider. Interfaccia in italiano, inglese, spagnolo, francese e tedesco.
```

## English

**Name** (from the manifest): autoGroup – AI Tab Groups

**Summary** (from the manifest, 66 characters out of 132): Group your tabs with the AI of your choice, with preview and undo.

**Detailed description**:

```text
Too many open tabs? autoGroup sorts them into Chrome tab groups, by site or by topic, and shows you the proposal before moving your tabs (except tabs from sites you add to a category, which you can have grouped automatically).

HOW IT WORKS
• Click the icon (or press Alt+Shift+G) and the side panel opens with a proposal for your window.
• Review and edit the groups: rename, recolor, move or remove a tab, discard a group.
• Press "Apply" and the groups are created. "Undo" puts everything back.
No tab moves without your confirmation, except tabs from sites you add to a category: they go straight into their group (you can turn this off).

TWO MODES
• By site: tabs from the same site go in the same group. Instant, no setup, no data leaves your computer.
• With AI: tabs sorted by topic, into your categories or new groups suggested by the AI. Groups you already have open are extended with the tabs that belong there.
• In both: add a site to a category and its tabs always go there, even on their own while you browse (you can turn this off).

YOU CHOOSE THE AI
• The model built into Chrome, if your computer supports it: free, no keys, no data leaves your computer.
• A model running on your computer.
• An online service compatible with the OpenAI API, with your own key.
• Optional: a fast classifier that puts tabs into your categories.
If the AI doesn't answer, grouping by site takes over: you always get a proposal. While the AI works you already see the by-site proposal, and "Use this" saves you the wait.

PRIVACY
• No developer servers, no analytics.
• The AI only receives the title and cleaned address of your tabs (no parameters), never pinned tabs, grouped tabs or tabs from domains you exclude.
• Reading page descriptions is optional and asks for permission only when you turn it on.
• API keys stay on this computer.

It spots tabs open twice and tabs you haven't opened in a week, shows which ones it would close and closes the ones you confirm. From the panel you can jump to a tab, mute it, or collapse or close a group. Export and import your settings as a file.

A first-run guide helps you choose the mode and the provider. Interface in English, Italian, Spanish, French and German.
```

## Spanish

**Nombre** (from the manifest): autoGroup – Grupos de pestañas con IA

**Resumen** (from the manifest, 80 characters out of 132): Agrupa tus pestañas con la IA que elijas, con vista previa y opción de deshacer.

**Descripción detallada**:

```text
¿Demasiadas pestañas abiertas? autoGroup las reparte en grupos de Chrome, por sitio o por tema, y te enseña la propuesta antes de mover las pestañas (salvo las de los sitios que añadas a una categoría, que puedes agrupar automáticamente).

CÓMO FUNCIONA
• Haces clic en el icono (o pulsas Alt+Shift+G) y se abre el panel lateral con la propuesta para la ventana.
• Revisas y editas los grupos: cambia el nombre o el color, mueve o quita una pestaña, descarta un grupo.
• Pulsas «Aplicar» y se crean los grupos. «Deshacer» lo deja todo como estaba.
Ninguna pestaña se mueve sin tu confirmación, salvo las de los sitios que añadas a una categoría: van directamente a su grupo (se puede desactivar).

DOS MODOS
• Por sitio: las pestañas del mismo sitio, en el mismo grupo. Inmediato, sin configuración, ningún dato sale de tu ordenador.
• Con IA: las pestañas ordenadas por tema, en tus categorías o en grupos nuevos que propone la IA. Los grupos que ya tienes abiertos se amplían con las pestañas que encajan en ellos.
• En ambos: añade un sitio a una categoría y sus pestañas irán siempre allí, incluso solas mientras navegas (se puede desactivar).

LA IA LA ELIGES TÚ
• El modelo integrado en Chrome, si tu ordenador lo admite: gratis, sin claves, ningún dato sale de tu ordenador.
• Un modelo que se ejecuta en tu ordenador.
• Un servicio online compatible con la API de OpenAI, con tu propia clave.
• Opcional: un clasificador rápido que asigna las pestañas a tus categorías.
Si la IA no responde, se agrupa por sitio: siempre recibes una propuesta. Mientras la IA trabaja ya ves la propuesta por sitio, y con «Usar esta» no tienes que esperar.

PRIVACIDAD
• Sin servidores del desarrollador, sin estadísticas.
• A la IA solo llegan el título y la dirección limpia de las pestañas (sin parámetros), nunca las pestañas fijadas, ya agrupadas o de los dominios que excluyas.
• La lectura de la descripción de las páginas es opcional y pide permiso solo cuando la activas.
• Las claves de API se quedan en este ordenador.

Detecta las pestañas abiertas dos veces y las que no abres desde hace una semana, te muestra cuáles cerraría y cierra las que confirmes. Desde el panel vas a una pestaña, le quitas el sonido, contraes o cierras un grupo. Exporta e importa los ajustes en un archivo.

Una guía de inicio te ayuda a elegir el modo y el proveedor. Interfaz en español, inglés, italiano, francés y alemán.
```

## French

**Nom** (from the manifest): autoGroup – Groupes d'onglets IA

**Résumé** (from the manifest, 74 characters out of 132): Regroupez vos onglets avec l'IA de votre choix, avec aperçu et annulation.

**Description détaillée**:

```text
Trop d'onglets ouverts ? autoGroup les répartit en groupes Chrome, par site ou par thème, et vous montre la proposition avant de déplacer vos onglets (sauf ceux des sites que vous ajoutez à une catégorie, que vous pouvez faire regrouper automatiquement).

COMMENT ÇA MARCHE
• Cliquez sur l'icône (ou appuyez sur Alt+Shift+G) : le panneau latéral s'ouvre avec une proposition pour votre fenêtre.
• Vérifiez et modifiez les groupes : renommer, changer la couleur, déplacer ou retirer un onglet, écarter un groupe.
• Appuyez sur « Appliquer » et les groupes sont créés. « Annuler » remet tout comme avant.
Aucun onglet ne bouge sans votre confirmation, sauf ceux des sites que vous ajoutez à une catégorie : ils vont directement dans leur groupe (désactivable).

DEUX MODES
• Par site : les onglets d'un même site dans le même groupe. Instantané, sans configuration, aucune donnée ne quitte votre ordinateur.
• Avec l'IA : les onglets triés par thème, dans vos catégories ou dans de nouveaux groupes proposés par l'IA. Les groupes déjà ouverts sont complétés avec les onglets qui leur correspondent.
• Dans les deux : ajoutez un site à une catégorie et ses onglets y vont toujours, même tout seuls pendant que vous naviguez (désactivable).

VOUS CHOISISSEZ L'IA
• Le modèle intégré à Chrome, si votre ordinateur le prend en charge : gratuit, sans clé, aucune donnée ne quitte votre ordinateur.
• Un modèle qui tourne sur votre ordinateur.
• Un service en ligne compatible avec l'API OpenAI, avec votre propre clé.
• En option : un classificateur rapide qui range les onglets dans vos catégories.
Si l'IA ne répond pas, le regroupement par site prend le relais : vous avez toujours une proposition. Pendant que l'IA travaille, vous voyez déjà la proposition par site, et « Utiliser celle-ci » vous évite d'attendre.

CONFIDENTIALITÉ
• Aucun serveur du développeur, aucune statistique.
• L'IA ne reçoit que le titre et l'adresse nettoyée de vos onglets (sans paramètres), jamais les onglets épinglés, déjà groupés ou des domaines que vous excluez.
• La lecture de la description des pages est facultative et ne demande l'autorisation que lorsque vous l'activez.
• Les clés API restent sur cet ordinateur.

Il repère les onglets ouverts en double et ceux que vous n'avez pas ouverts depuis une semaine, vous montre ceux qu'il fermerait et ferme ceux que vous confirmez. Depuis le panneau, vous pouvez aller à un onglet, couper son son, réduire ou fermer un groupe. Exportez et importez vos paramètres dans un fichier.

Un guide au premier lancement vous aide à choisir le mode et le fournisseur. Interface en français, anglais, italien, espagnol et allemand.
```

## German

**Name** (from the manifest): autoGroup – KI-Tabgruppen

**Zusammenfassung** (from the manifest, 83 characters out of 132): Gruppiere deine Tabs mit der KI deiner Wahl – mit Vorschau und Rückgängig-Funktion.

**Ausführliche Beschreibung**:

```text
Zu viele offene Tabs? autoGroup sortiert sie in Chrome-Tabgruppen, nach Website oder nach Thema, und zeigt dir den Vorschlag, bevor Tabs verschoben werden (außer Tabs von Websites, die du einer Kategorie hinzufügst – die können automatisch gruppiert werden).

SO FUNKTIONIERT ES
• Klick auf das Symbol (oder drück Alt+Shift+G), und die Seitenleiste öffnet sich mit einem Vorschlag für dein Fenster.
• Prüf und bearbeite die Gruppen: umbenennen, Farbe ändern, einen Tab verschieben oder entfernen, eine Gruppe verwerfen.
• Drück „Anwenden“, und die Gruppen werden erstellt. „Rückgängig“ stellt alles wieder her.
Kein Tab bewegt sich ohne deine Bestätigung – außer Tabs von Websites, die du einer Kategorie hinzufügst: Sie kommen direkt in ihre Gruppe (abschaltbar).

ZWEI MODI
• Nach Website: Tabs derselben Website in derselben Gruppe. Sofort, ohne Einrichtung, keine Daten verlassen deinen Computer.
• Mit KI: Tabs nach Thema sortiert, in deine Kategorien oder in neue Gruppen, die die KI vorschlägt. Bereits geöffnete Gruppen werden um passende Tabs ergänzt.
• In beiden: Füg eine Website einer Kategorie hinzu, und ihre Tabs landen immer dort, auch von selbst beim Surfen (abschaltbar).

DU WÄHLST DIE KI
• Das in Chrome integrierte Modell, wenn dein Computer es unterstützt: kostenlos, ohne Schlüssel, keine Daten verlassen deinen Computer.
• Ein Modell, das auf deinem Computer läuft.
• Ein Onlinedienst, der mit der OpenAI-API kompatibel ist, mit deinem eigenen Schlüssel.
• Optional: ein schneller Klassifikator, der Tabs deinen Kategorien zuordnet.
Antwortet die KI nicht, wird nach Website gruppiert: Du bekommst immer einen Vorschlag. Während die KI arbeitet, siehst du schon den Vorschlag nach Website, und mit „Diesen nutzen“ musst du nicht warten.

DATENSCHUTZ
• Keine Server des Entwicklers, keine Statistiken.
• Die KI erhält nur Titel und bereinigte Adresse deiner Tabs (ohne Parameter), nie angeheftete oder bereits gruppierte Tabs und nie Tabs von Domains, die du ausschließt.
• Das Lesen der Seitenbeschreibungen ist optional und fragt erst nach der Berechtigung, wenn du es einschaltest.
• API-Schlüssel bleiben auf diesem Computer.

autoGroup erkennt doppelt geöffnete Tabs und Tabs, die du seit einer Woche nicht geöffnet hast, zeigt, welche es schließen würde, und schließt die, die du bestätigst. In der Seitenleiste springst du zu einem Tab, schaltest ihn stumm, klappst eine Gruppe ein oder schließt sie. Exportier und importier deine Einstellungen als Datei.

Eine Anleitung beim ersten Start hilft dir, Modus und Anbieter zu wählen. Oberfläche auf Deutsch, Englisch, Italienisch, Spanisch und Französisch.
```

## Screenshot captions

| # | Italian | English |
|---|---|---|
| 1 | Le tab in ordine, per argomento | Your tabs, sorted by topic |
| 2 | Subito una proposta, mentre l'AI pensa | A proposal right away, while the AI thinks |
| 3 | L'AI la scegli tu | You choose the AI |
| 4 | Le tue categorie | Your categories |

The captions are already in the images (see `COPY` in `scripts/store-assets.mjs`).
