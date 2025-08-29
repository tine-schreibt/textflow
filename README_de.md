(English version: [Click](https://github.com/tine-schreibt/textFlow/blob/main/README.md))

### TL;DR

Mit **textFlow** kannst du Flows definieren - dynamische Dokumente, die aus dem
Inhalt mehrerer Notizen bestehen - und sie editieren, wobei alle Änderungen
getrackt und automatisch zurück in ihre Quellnotizen gespeichert werden.
textFlow ist für Autor:innen längerer Texte gedacht, kann aber von allen genutzt
werden, die ihre Arbeit im größeren Zusammenhang sehen oder editieren wollen. Im
Grunde ist textFlow der Versuch, Scrivenings in Obsidian zu holen - intuitiv,
flexibel und leicht in die meisten Arbeitsabläufe zu integrieren - ob du nun
lieber mit der Tastatur oder der Maus navigierst.

Doch genug des Werbesprechs: Unter der Haube ist textFlow ein einziges großes
Workaround für den Umstand, dass Obsidian explizit für die Arbeit mit einzelnen,
kleinen Notizen gedacht ist. Und auch wenn textFlow sein Ding mit einer gewissen
Eleganz macht, hat es seine Einschränkungen und Unannehmlichkeiten, die dieses
Readme erklärt. Oder erklären sie dieses Readme? Wahrscheinlich beides...

Außerdem ist das Ding neu, weshalb noch nicht alle Eigenheiten
bekannt/gefixt/mit Workaround versehen sind. Falls du etwas aufstöberst, das
dieses Readme nicht erwähnt,
[lass es mich wissen](#12-melde-einen-bug--zeig-deine-liebe). _Bitte ziehe in
Erwägung, Obsidians eigenes Datenwiederherstellung-Plugin oder 'Edit history'
von Antonio Tejada mitlaufen zu lassen, bis textFlow dein Vertrauen verdient
hat._

**Du willst immer noch gleich loslegen?**

- [Voraussetzungen und Einrichtung](#5-voraussetzungen-und-einrichtung)
- [Los gehts](#8-los-gehts)
- [Probleme beheben](#9-probleme-beheben)

**Du willst erstmal wissen, was du eigentlich bekommst und wie du textFlow
stressfrei benutzen kannst?**

1. [Featurefeatures](#1-featurefeatures)
2. [Sicherheitsfeatures](#2-sicherheitsfeatures)
3. [Einschränkungen und bekannte Unannehmlichkeiten](#3-einschränkungen-und-bekannte-unannehmlichkeiten)
4. [Use cases](#4-use-cases)
5. [Voraussetzungen und Einrichtung](#5-voraussetzungen-und-einrichtung)
6. [Einstellungen](#6-Einstellungen)
7. [Befehle](#7-befehle)
8. [Los gehts](#8-los-gehts)
9. [Probleme beheben](#9-probleme-beheben)
10. [Spickzettel](#10-spickzettel)
11. [textFlow und Gliederung im Vergleich](#11-textflow-und-gliederung-im-vergleich)
12. [Melde einen Bug / Zeig deine Liebe](#12-melde-einen-bug--zeig-deine-liebe)

<hr>

### 1. Featurefeatures

##### Bereits implementiert:

1. **Baue 'intelligente' Flows:** Wähle Notizen aus, indem du
   Lesezeichen-Gruppen oder Ordner, Tags und
   [Eigenschaften](#wie-gehen-eigenschaften) als Ein/Ausschluss-Kriterien
   benutzt. textFlow kopiert sie für dich in eine einzige Notiz zusammen (einen
   Flow). Wenn du eine Notiz (oder einen Ordner) verschiebst, hinzufügst oder
   löschst - sei es in deinen Lesezeichen oder deinem Vault - registriert
   textFlow das und baut automatisch alle relevanten Flows neu, um die Änderung
   widerzuspiegeln. Wenn du die Eigenschaften einer Notiz änderst, so dass sie
   in einen neuen Flow eingeschlossen wird, musst du von Hand neu bauen.
   - **Praktisch:** Rechts-Klick auf Ordner gibt die Option:
     `textFlow: Erzeuge neuen Flow aus diesem Ordner`. Die Definition kann dann
     in den Settings verfeinert werden. <small>Für Lesezeichengruppen ist diese
     Funktionalität derzeit leider nicht verfügbar.</small>
2. **Strukturiere deine Flows:**
   - Flows, die über Ordner, Tags oder Eigenschaften definiert sind, habe zwei
     Sortieroptionen:
     1. Spiegle die Reihenfolge der _Notizen_, wie sie im Explorer auftauchen.
     2. Spiegle die Reihenfolge der _Ordner_, wie sie im Explorer auftauchen.
   - Flows, die aus Lesezeichen-Gruppen definiert sind, können außerdem die
     manuelle Reihenfolge der Objekte im Ordner spiegeln, unabhängig davon, ob
     sie Notizen oder Ordner sind. Benutze die Reihenfolge, die sich für dich
     intuitiv/am wenigsten verwirrend anfühlt, oder besser zum jeweiligen Flow
     passt. Manche Reihenfolgen funktionieren mit oder ohne
     Ordner-/Gruppen-Titel besser.
3. **Bearbeite Flows wie jede andere Notiz:** textFlow trackt, in welcher Region
   eine Änderung stattfindet und synchronisiert alles automatisch in die
   richtige Quellnotiz zurück, sobald du außerhalb des Textfensters (leaf)
   klickst.
4. **Füge deinen Flows Eigenschaften hinzu:** Benutze dazu einfach wie gewohnt
   das Eigenschaften-Plugin. Sie bleiben erhalten, wenn du deinen Flow neu baust
   und sind nützlich, wenn du über die Ansicht in den Settings hinaus den
   Überblick behalten willst.
5. **Flows sind wirklich nur eine weitere, gewöhnliche Notiz mit ein paar
   angehängten Listenern und Erweiterungen:** Also _alles funktioniert in deinen
   Flows:_ Deine Themes funktionieren. Inline-styles funktionieren.
   Dataview-Tabellen werden wie gewohnt angezeigt. Die Gliederungsansicht
   funktioniert
   ([größtenteils](#3-einschränkungen-und-bekannte-unannehmlichkeiten)). Suche
   in Notizen funktioniert. Callouts, Listen, Code-Blöcke, Tabellen, Tabs, alles
   funktioniert. Weil - wie gesagt - ein Flow ist nur eine ganz normale Notiz
   mit ein bisschen API-Bling dran.
6. **Synchronisiere manuell zurück in die Quellnotizen:** Es ist nicht wirklich
   nötig (<small>außer wenn du Obsidian per Tastaturkürzel schließt</small>),
   aber ich kenn das Gefühl, daher kannst du jederzeit von Hand synchronisieren.
7. **Navigiere innerhalb deiner Flows mit dem Datei-Explorer:** Yup. Ich weiß!
   textFlow hebt sogar die Quellnotiz der aktiven Region hervor.
   [Es funzt allerdings nicht perfekt](#3-einschränkungen-und-bekannte-unannehmlichkeiten)
8. **Ein Fuzzy-Navigation Modal:** Wenn du es gewohnt bist, Obsidians
   Schnellauswahl zu benutzen, wirst du dich hier wie zuhause fühlen - mit ein
   paar netten Tricks obendrauf:
   - Setze `?` vor deine Suche, um sie auf den Flow im aktiven Leaf zu
     beschränken
   - `*` um in Flows den anderen Flows zu suchen
   - `:` um in Flow-Namen zu suchen
   - oder nichts, um alles gleichzeitig zu durchsuchen, inklusive LeafIDs und
     Cursor-Positionen
   - der Platzhalter im Eingabefeld zeigt dir außerdem all diese Informationen
     zum aktiven Leaf an (vorausgesetzt es enthält einen Flow) - Flow-Name,
     aktive Region, LeafID und aktuelle Cursor-Position. Details zur Nutzung des
     Modals findest du hier:
     [Wie funktioniert das Fuzzy-Navigation Modal](#-wie-geht-fuzzy-navigation)
9. **Eine praktische Menüleiste:** Falls du Buttons vorziehst, hat textFlow eine
   nette (versteckbare) Menüleiste für dich. Darin findest du einen Button zum
   Synchronisieren und einen zum Neubauen. Und außerdem:
   - **Ein Navigationsmenü:** Dieses Dropdown macht es leicht,
     unzusammenhängende Flows zu navigieren, oder falls dir die
     Explorer-Navigation zu fickelig ist. Das Menü hat auch eine Fuzzy Search,
     damit du schneller findest, wo du hin willst.
   - **Deinen Cursor-Verlauf:** textFlow speichert die Cursor-Position für die
     fünf zuletzt besuchten Regionen der fünf zuletzt geöffneten Leaves für alle
     deine Flows (Updates passieren mit jeder Synchronisation in die
     Quellnotizen). Es gibt auch einen praktischen Button und Befehl, um
     automatisch zur letzten bekannten Position zurückzuspringen.
   - **Einen Auswahl-Button für die aktive Region:** Falls du eine
     Copy/Paste-Operation brauchst. Auch hierfür gibt es einen Befehl.
   - **Einen Export-Button:** Dieser Button macht eine Kopie deines Flows, ohne
     UUIDs. Sie wird in deinem Root-Ordner abgelegt und wie folgt benamst:
     `${flowName}_${yyyy-mm-dd_hh-mm}.md`
   - **Ein Min/Max-Button:** Damit du die Menüleiste bei Bedarf minimieren
     kannst. Es gibt auch einen Befehl, um sie an/auszuschalten, falls du lieber
     tippst.
10. **Ein praktisches Switcher-Modal:** Im Flow-Switcher gibt es Buttons um:
    - Flows in einem neuen Tab oder Split zu öffnen
    - zwischen offenen Tabs mit Flows zu springen
    - schnell mehrere Tabs mit Flows zu schließen
    - inaktive Flows neu zu bauen
11. **Ein Language File:** Es gibt bereits eine deutsche und eine englische
    Version. Falls du eine weitere Sprache hinzufügen möchtest, sag mir
    bescheid.
12. **Kleinigkeiten:**
    - Du kannst die Scrolleisten ausschalten.
    - Rechtsklick in den Datei-Explorer hat die Option, eine Datei im aktuellen
      Ordner zu erzeugen.

##### Kommt vielleicht in der Zukunft, wenn genug Leute danach fragen:

- **Favoriten für das Switcher-Modal:** Falls du eine metrische Tonne Flows
  hast, Hilfe brauchst, um nicht den Überblick zu verlieren, und
  Eigenschaften/Dataview dir unheimlich sind.
- **Öffne Wiki-Links in Flows:** Das wäre dann eine Rechtsklick-Angelegenheit,
  schätze ich.
- **Frei wählbarer Name für den Systemordner:** Wäre nicht schwer zu
  implementieren, ich hab nur grad keinen Bock drauf.

<hr>

### 2. Sicherheitsfeatures

1. **Dein Verständnis, dass dieses Plugin komplex ist und dass Obsidian und
   CodeMirror manchmal nen Moment brauchen, um ein Flow-Leaf einzurichten:**
   Also gibst du ihnen diesen Moment und klick-spamst - z.B. - nicht, um mehrere
   neue Flow-Leaves schnell hinter einander zu öffnen. Atme einfach mal tief
   durch zwischen zwei Klicks.
2. **Schreibschutz:**
   1. **Unsichtbare UUIDs:** UUIDs sind zufällige Strings aus 46
      nicht-druckbaren Zeichen, die textFlow am Ende des Inhalts einer jeden
      Quelldatei platziert, um die Cursor-Position relativ dazu zu tracken. Sie
      sind schreibgeschützt, um ihre Integrität zu garantieren (und damit die
      deines Flows). Das ist der Grund warum...
      - **... es _niemals sicher_ ist, einen Flow außerhalb von textFlows
        Kontext zu editieren.** Du könntest eine UUID beschädigen und dadurch
        die nachfolgenden Synchronisationen versauen. Im Bestfall darfst du
        danach zusammengeschmissene Regionen auseinander friemeln, im
        schlimmsten Fall verlierst du einen Teil deines Textes.
      - **... es _niemals sicher_ ist, einen Flow in einem anderen Text-Editor
        als Obsidian zu öffnen.** Manche Text-Editoren löschen automatisch
        nicht-druckbare Zeichen, so wie die, die die UUIDs ausmachen. Und du
        weißt bereits, was das für Folgen hat.
   2. **Flows sind während Syncs und Neubau schreibgeschützt:** Das dient dazu,
      zu verhindern, dass du während des Prozesses versehentlich die Daten
      korrumpierst.
3. **Flows werden von Obsidian gespeichert:** Da Flows - was Obsidian angeht -
   nur ganz gewöhnliche Notizen sind, werden sie auch wie alle anderen Notizen
   gespeichert. Das bedeutet, dass deine Arbeit in einem Flow genau so sicher
   ist wie in jeder anderen Notiz.
4. **Automation:**
   1. **Auto-Sync:** Wann immer du das Leaf (den Tab) wechselst, werden all
      deine neuen Textänderungen automatisch in die entsprechende Quelldatei
      zurück gesynct. Das ist aggressiv, aber notwendig. <small>(Wenn es dir
      unheimlich ist, kannst du Obsidians Datenwiederherstellung-Plugin
      benutzen - oder auch 'Edit history' von Antonio Tejada, das eine noch
      feinkörnigere Historie erlaubt. Funktionen zum Vergleichen und selektiven
      Wiederherstellen sind bei beiden eingebaut. </small>)
   2. **Auto-Neubau:** Wann immer du ein Leaf fokussierst, das einen für den
      Neubau vorgemerkten Flow enthält, wird automatisch ein Neubau getriggert.
      - **Ein Flow wird für den Neubau markiert...**
        1. ... wenn du eine Notiz, die Teil eines Flows ist oder es
           wahrscheinlich sein wird*, umbenennst, verschiebst, erzeugst oder
           löschst (<small>*basierend auf dem Ordner, in dem sie sich befindet,
           nicht aufgrund anderer Eigenschaften</small>)
        2. ... wenn du zwei überlappende Flows aktiv hast und eine der Regionen
           bearbeitest, an denen sie sich überlappen (diese Regionen sind im
           Navigationsdropdown markiert, bzw. du bekommst eine Benachrichtigung,
           wenn du in eine Überlappung clickst). **WICHTIG:** _Das ist wirklich
           **nur eine Sicherheitsvorkehrung** für versehentliche edits, und
           nicht dazu gedacht, ausgenutzt zu werden, um routinemäßig in
           Überlappungen zu arbeiten; **das Feature wird sogar instabil**, wenn
           ein Flow neu gebaut wird, während er in mehr als einem Leaf geöffnet
           ist, was zu Patzern beim Tracken und Syncen führt._
        3. ... wenn du eine Quellnotiz direkt editierst (auch wenn du nur
           irrelevante Eigenschaften bearbeitest, sorry)
        4. ... **aber nicht** wenn du die Eigenschaften einer Nicht-Quellnotiz
           so änderst, dass sie nun in die Definition eines Flows passt. Hier
           musst du von Hand einen Neubau auslösen.
      - **Alle Neubauten sind vollständige Neubauten:** Die gesamte
        Datenstruktur im Hintergrund des Flows wird neu berechnet und der Flow
        komplett neu geschrieben, so dass beide immer in Übereinstimmung mit
        einander und den Quelldaten sind. Das bedeutet auch, dass große
        Neubauten einen Moment brauchen können.
      - **Um exzessive Neubauten zu vermeiden:**
        - Halte nur Flows offen, an denen du aktiv arbeitest. Einen Flow mit all
          seinen Leaves zu schließen, braucht nur einen Klick ins
          Switcher-Modal. Außerdem werden all deine Cursor-Positionen für bis zu
          fünf Leaves pro Flow gespeichert, und sind für dich in der
          Menüleiste/per Tastenkürzel verfügbar, sobald du den Flow wieder
          öffnest. Denke auch darüber nach, Flows in verschiedenen
          Arbeitsbereichen zu behalten.
        - Versuche, die Überlappung zwischen Flows gering zu halten und/oder
          vermeide es, an überlappenden Regionen zu arbeiten.
        - Schließe alle Flows bevor du
          - ausgiebig an Quellnotizen arbeitest
          - deinen Flow neu strukturierst
          - die Eigenschaften vieler Notizen editierst
5. **Neubau prüft Quellnotizen auf UUIDs:** Wenn bei einer Synchronisation etwas
   schief geht, resultiert es gewöhnlich darin, dass mehrere Regionen in eine
   einzelne Quellnotiz kopiert werden. Deshalb sucht die Neubau-Funktion nach
   UUIDs, die auf diesem Weg Quellnotizen gelandet sind. Sie stoppt dann den
   Neubau und informiert dich, so dass du das Problem beheben kannst.
6. **Keine veralteten Edits in inaktiven Flows:** Wenn du einen Flow komplett
   schließt (also all seine Leaves), findet eine automatische Synchronisation
   statt. Das verhindert, dass veraltete Versionen in inaktiven Flows
   herumhängen, die später neuere Änderungen überschreiben könnten. Wenn du
   ältere Versionen einer Region behalten willst, mach einen Schnappschuss der
   Quellnotiz, bevor du mit dem Arbeiten beginnst <small>(probier mal 'Backitup'
   von hammadXP - funtioniert am besten, wenn du zusätzlich 'Diff view' von Till
   Friebe benutzt, um Versionen zu vergleichen und selektiv
   wiederherzustellen)</small>.
7. **Sensibler Kram ist versteckt:** Der Ordner, in dem textFlow deine Flows
   aufhebt, ist standardmäßig versteckt, damit du nicht daran rumfummelst. Du
   kannst ihn allerdings anzeigen lassen, wenn du Flows direkt daraus öffnen
   willst. Änder nur nicht seinen Namen, oder die Namen der Flows.
8. **Statusanzeigen:** Das Switcher-Modal zeigt an, wenn ein Flow für einen
   Neubau markiert ist. Du kannst außerdem eine Anzeige für ausstehende
   Synchronisationen in der Menüleiste und - falls du willst - im Datei-Explorer
   sehen.
9. **Automatische Prüfung auf externe Bearbeitung von Quellnotizen:** Falls du
   öfter mal Quellnotizen auf Geräten bearbeitest, auf denen textFlow nicht
   läuft (z.B. deinem Handy oder Tablet), kann textFlow für dich Folgendes
   prüfen:
   - **Zeitstempel der letzten Bearbeitung** - das reicht für die meisten Use
     Cases aus und ist die Standardeinstellung
   - **Zeitstempel und Hash** - das kannst du aktivieren, wenn zu viele unnötige
     Neubauten getriggert werden
   - **Immer den Hash** - nur nützlich, wenn du deinem Sync-Service nicht
     traust, oder in einem riskanten Setting arbeitest (mit git oder einem
     'intelligenten' / speichersparenden / streaming Sync-Service) **Diese
     automatischen Checks laufen **
   - für frisch geöffnete Flows,
   - wenn du nach mindestens 5 Minuten der Inaktivität in Bezug auf einen Flow
     wieder mit diesem interagierst (Leaf aktivieren oder Textänderung),
   - und wenn du in eine neue Region klickst (dann allerdings nur für die
     Region). Falls es dir wichtig ist, kannst auch alle deine Flows - aktive
     wie inaktive - manuell per Befehl prüfen lassen. **HINWEIS:** Die Checks
     funktionieren natürlich nur, wenn du deinem Sync-Service auch die nötige
     Zeit lässt, seine Arbeit zu tun! Also achte darauf, dass die Sync in deinen
     Vault vollständig beendet ist, ehe du weiter arbeitest.
10. **Manuelle Markierung für Neubau:** Wenn du automatische Checks
    deaktivierst, kannst du immer noch bei Rechtsklick auf eine Notiz im
    Datei-Explorer auswählen, dass alle Flows, die sie enthalten, für den Neubau
    markiert werden sollen. Außerdem gibt es auch einen Befehl, mit dem du
    sämtliche deiner Flows für den Neubau markieren kannst.
11. **Definitions-Backup:** Wann immer du eine Flow-Definition neu erstellst
    oder bearbeitest, wird eine Kopie der Definition mit Zeitstempel gespeichert
    (bis zu drei Versionen pro Flow), so dass du alte Definitionen
    wiederherstellen kannst. Falls du das Plugin mal komplett deinstallieren und
    neu installieren musst, kannst du die Datei mit den Backups vorübergehend im
    Wurzelverzeichnis deines Vaults lagern (du wirst sie in Obsidian allerdings
    nicht sehen können, weil sie eine `.json`-Datei ist). Sie wird beim ersten
    Neustart des Plugins automatisch eingelesen und dann aus dem Vault gelöscht.
    So kannst du all deine Flow-Definitionen schnell über das Modal
    wiederherstellen.

<hr>

### 3. Einschränkungen und bekannte Unannehmlichkeiten

#### Erwähnte Sachen zuerst

**Zeug in der Gliederungsansicht umsortieren:** Da der letzte Abschnitt in einer
Region immer auch die schreibgeschützte UUID umfasst, kann dieser Abschnitt
nicht per drag-and-drop verschoben werden. Alles dazwischen kannst du aber wie
gewohnt rumschieben.

**Die Probleme der Navigation per Datei-Explorer:** 1. **Fokus:** Navigation ist
vom Fokus auf ein Leaf abhängig - was aber ein störrisches Biest ist. Also musst
du in das Leaf klicken, einmal tief durchatmet, um der UI Zeit zu geben, sich zu
sortieren, ehe die in den Dateie-Explorer klickst. Die nächsten Klicks
funktionieren meist, aber manchmal musst du neu fokussieren, indem du wieder ins
Leaf klickst. 2. **Interferenzen:** 1. **Mehrfachauswahl:** Damit die Navigation
ohne UI-Gezucke funktioniert, muss ich alle Klicks einfangen und das
Standardverhalten unterbinden. Das führt dazu, dass Mehrfachauswahl zwar noch
funktioniert, aber nicht so wirklich gut. Um den Schmerz zu lindern, gibt es
einen Befehl, um den Klick-Listener abzuschalten -
`textFlow: Dateiexplorer-Navigation umschalten`. Also falls du das normale
Verhalten brauchst, einfach Befehlspalette/Tastenkürzel benutzen. 2. **Andere
Plugins:** Falls du noch ein anderes Plugin benutzt, das verändert, wie
Links-Klicks in den Datei-Explorer gehandhabt werden, ist es wahrscheinlich,
dass es zu Interferenzen mit textFlows preventDefault() kommt. Also falls du da
Probleme hast, versuch mal, textFlows Klick-Listener abzuschalten, so wie du es
für Mulit-Select tun würdest.

#### Der andere Kram, nach Kategorie sortiert:

##### Sache, die du machen kannst, die deine Rückgängig-Historie aber noch mehr versauen werden, als du es gewohnt bist

1. **Einen Flow in mehr als einem Leaf öffnen und bearbeiten:** Du kannst einen
   einzelnen Flow in so vielen Leaves öffnen, wie du willst, und in jedem Leaf
   eine andere Region bearbeiten. Jede Bearbeitung wird separat getrackt und
   synchronisiert.
   - **Aber:** Es gibt nur eine Rückgängig-Historie (`cmd+z`) für all diese
     Leaves. Wenn du also Region1 in Leaf1 bearbeitest, und Region2 in Leaf2,
     ihre Rückgängig-Historie werden unlösbar verstrickt.
   - **Stattdessen:** Definiere kleinere Flows, die nur eine der Regionen
     beinhaltet, die du bearbeiten willst - per Kapitel oder Akt oder
     Erzählstrang. Oder wenn du an mehreren Szenen arbeiten willst, die dicht
     bei einander liegen, überlebe, sie als Quellnotizen zu öffnen.
2. **Überlappende Flows öffnen und die Überlappung editieren, aka aktive Flows
   neu bauen:** Du kannst überlappende Flows öffnen und auch die Regionen
   bearbeiten, wo sie sich überlappen. Auto-Neubau wird sicher stellen, dass
   keine Änderung verloren geht. **WICHTIG:** _Das ist wirklich **nur eine
   Sicherheitsvorkehrung** für versehentliche edits, und nicht dazu gedacht,
   ausgenutzt zu werden, um routinemäßig in Überlappungen zu arbeiten; **das
   Feature wird sogar instabil**, wenn ein Flow neu gebaut wird, während er in
   mehr als einem Leaf geöffnet ist, was zu Patzern beim Tracken und Syncen
   führt._
   - **Außerdem:** Selbst wenn du zwei überlappende Flows in nur je einem Leaf
     öffnest, Überraschung, die Rückgängig-Historien werden dennoch nutzlos.
     Diesmal weil du nicht in den Zustand vor dem Neubau zurückspringen kannst,
     ohne das Tracking zu versauen. I würde das Zurückspringen zu diesem Punkt
     blockieren, aber CodeMirror 6 scheint keine API dafür zu haben. Stattdessen
     schick ich dir eine Benachrichtigung mit einer Anleitung, wie du vorgehen
     solltest (Wiederherstellen, bis du wieder auf der anderen Seite des Neubaus
     angekommen bist, oder den Flow neu bauen, wenn dus schon versaut hast).
   - **Stattdessen:** Sei vorsichtig mit dem Rückgängigmachen und bearbeite
     keine überlappenden Regionen, _ganz besonders_ nicht in mehreren Leaves.
     Die Überlappungen sind im Navigations-Menü markiert, bzw. du kriegst eine
     Benachrichtigung, wenn du in einen Überlapp klickst. Kleiner Flows helfen
     auch hier.
3. **Eine Quellnotiz bearbeiten, während ihr Flow aktiv ist:** Auto-Synch und
   Auto-Neubau sorgen dafür, dass nichts verloren geht.
   - **Aber:** Um beim Thema zu bleiben... Sobald du die Quelle bearbeitest,
     wird der Flow für den Neubau markiert, und sobald du das Leaf fokussierst,
     wird der Flow neu gebaut und die Rückgängig-Historie ist verloren. Die
     Historie der Quellnotiz bleibt allerdings erhalten, und ctrl+z wird als
     Bearbeitung registriert, also auch im Flow reflektiert.
   - **Trotzdem stattdessen:** Bearbeite die Region im Flow oder schließe den
     Flow, bevor du die Quelle bearbeitest.

##### Weitere Einschränkungen

1. **Notwendige Datenduplikation:** Flows sind zusätzliche Notizen, die den
   Inhalt ihrer Quellnotizen replizieren; nur so funktioniert das alles. Und
   wenn Datenduplikation dein Blut zum Kochen bringt, ist dieses Plugin nicht
   das richtige für dich.
2. **Flows können NICHT sicher mit anderen Text-Editoren geöffnet werden:** Die
   nicht-druckbaren Zeichen, aus denen die unsichtbaren UUIDs bestehen, die die
   Regionen von einander abgrenzen, werden von einigen Text-Editoren
   standardmäßig gelöscht. Einen Flow auch nur mit so einem Editor zu öffnen,
   wird als das Tracking zerstören, selbst wenn du den Flow nichtmal in der Nähe
   einer Regionengrenze bearbeitest.
3. **Keine manuelle Sortierung:** Falls du ein Plugin benutzt, um deine Notizen
   im Datei-Explorer zu sortieren, tut mir leid, textFlow orientiert sich am
   tatsächlichen Dateibaum, nicht an Sortierungen, die auf UI-Ebene passieren.
   Falls du deine Ordner und Notizen absolut nicht durchnumerieren willst (dabei
   ist das so viel robuster...), spiegle deine manuelle Sortierung in einer
   Lesezeichengruppe und baue deine Flows von dort (einige Plugins für manuelle
   Sortierung basieren eh auf Lesezeichen). Du kannst dann allerdings keine
   Eigenschaften benutzen, um eine auf Lesezeichen basierende Definition zu
   verfeinern.
4. **Wiki-Links funktionieren nicht:** Im Moment funktionieren Wiki-Links nicht
   innerhalb von Flows. Vielleicht mach ich da ein Workaround, falls genug Leute
   danach fragen.
5. **Kein Extra-Zeug im Lesemodus:** textFlow ist ein Bearbeitungstool, daher
   habe ich nichts spezielles für den Lesemodus implementiert.

##### Bekannte Unannehmlichkeiten

1. **Neubau kann einen Moment dauern:** Besonders bei langen Flows. Ist also
   möglich, dass du ein Sekündchen warten musst, wenn du Leaves wechselst und
   einen Neubau triggerst. Es gibt aber einen kleinen Fortschrittsbalken,
   also... yay...
2. **Erstellung neuer Notizen:** Wenn du Obsidian sagst, dass es neue Notizen im
   gleichen Ordner wie die gerade aktive Notiz erstellen soll, führt das dazu,
   dass diese neue Notiz in textFlows Systemordner erstellt wird, sofern gerade
   eine Flow-Notiz im aktiven Leaf ist. Das nervt - vor allem wenn der Ordner
   versteckt ist. Deshalb habe ich einen Befehl geschrieben, auf den ihr per
   Rechtsklick auf jede beliebige Notiz im Datei-Explorer aufrufen könnt:
   `textFlow: textFlow: Erstelle eine neue Notiz in diesem Ordner`. Das tut, was
   es sagt und - so schätze ich mal - wird allgemein ganz nützlich sein. Die
   neue Notiz heißt `_untitled` und erscheint ganz oben im Ordner.

##### Da kann mein Plugin nichts für (glaub ich), aber trotzdem... (für einige hab ich Workarounds)

In keiner besonderen Reihenfolge:

1. **Manche Dinge brauchen Zeit, um sich zu sortieren:** Leaf-Fokus ist nicht
   das einzige an Obsidian (und CodeMirror), dass manchmal nen Moment braucht.
   Also falls dir etwas verbuggt vorkommt, versuch es noch mal, aber langsamer.
   Wenns dann immer noch verbuggt wirkt, schreib mir auf
   [github](#12-melde-einen-bug--zeig-deine-liebe).
2. **Zuckende Scrolleiste:** Wenn du dich in der Mitte einer Wand aus Text mit
   keinem Trenner / keiner Überschrift in Sicht, fängt der Griff der Scrolleiste
   an zu zucken, weil... frag die CodeMirror Community. Falls dich das stört und
   dein Theme dir nicht erlaubt, die Scrolleiste zu verstecken, benutze den
   Schalter in textFlows Einstellungen.
3. **Implizite Größenbeschränkung für Flows:** Obsidians handhabt offene Notizen
   im RAM. Wenn du also dein Viertelmillion Worte langes Epos offen hast - sei
   es in einem Flow oder auf mehrere verteilt - kann die UI ein bisschen langsam
   werden. Also halt deine Flows eher klein und öffne nur, was du unbedingt
   brauchst. Außerdem:
4. **Vollständiges Neuschreiben von Flows:** Obsidian macht keine partiellen
   Updates von Dateien. Wenn du also einen langen Flow offen hast, schreibt
   Obsidian das komplette Ding, von oben bis unten, wieder und wieder auf die
   Platte, während du daran arbeitest. _Für moderne SSD-Karten ist das kein
   Problem_, aber wenn du mit einer sehr kleinen, sehr alten SSD arbeitest,
   solltest du, wieder mal, deine Flows eher klein halten. (Zum Vergleich: Dein
   unfertiger 50.000-Wort Roman hat unter 400kB, während dein 250.000-Wort Epos
   die 2MB knackt).
5. **Kein Auto-Sync wenn du Obsidian schließt:** Onunload gibt Obsidian Plugins
   kaum genug Zeit, ihren Kram aufzuräumen und Einstellungen zu speichern. Du
   musst also von Hand speichern und neu laden, falls du cmd+q benutzt, um
   Obsidian zu schließen (und kein blur event triggerst, das eine Sync auslöst,
   bevor Obsidian dicht machen kann).
6. **Alphabetische Reihenfolge ist relativ:** Falls du deine Notizen so benamst:
   'basisname', 'basisname 1', 'basiname 2' usw. erscheinen sie zwar im
   Datei-Explorer, wie man es erwarten würde, aber JavaScript ist der Ansicht,
   dass 'basisname' _nach_ 'basisname 1' kommt. In deinem Flow werden also alle
   numerierten Notizen vor der unnumerierten kommen. Lösung: 'basisiname 0'.
7. **'Editing toolbar' überlappt sich mit der textFlow Menüleiste:** Falls du
   das Plugin 'Editing toolbar' von Cuman in der 'top' Position benutzt, wird
   dir auffallen, dass es textFlows Menüleiste größtenteils überdeckt. Ich habe
   für Stunden erfolglos versucht, das zu lösen, ohne meiner Menüleiste Bugs zu
   verpassen. [Das Ergebnis](#9-probleme-beheben).

<hr>

### 4. Use Cases

#### 1. Maximale Nutzung

- Du hast jedes Kapitel oder jeden Akt deines Buches in einem Flow und arbeitest
  damit.
- Du benutzt Quellnotizen nur ihrer Eigenschaften wegen, und um Änderungen aus
  deinen Haupt-Arbeitsflows in die Neben-Flows zu kopieren, die du benutzt, wenn
  du auf einen bestimmten Aspekt deiner Geschichte fokussieren willst.
- Vielleicht benutzt du textFlow in Kombination mit der
  [Gliederung](#11-textflow-und-gliederung-im-vergleich), und die diversen
  Sicherheitsfunktionen helfen dir, darauf zu vertrauen, dass dein Arbeit mit
  textFlow sicher ist.

#### 2. Minimale Nutzung

- Du machst all deine Arbeit ausschließlich an einzelnen Notizen und benutzt
  textFlow nur gelegentlich, um sie im Kontext zu sehen, oder sie für jemand
  anderes im Kontext zu exportieren.
- Manche der visuellen UI-Features sind unnötig für dich, also schaltest du sie
  ab.
- textFlow bleibt im Hintergrund und kommt dir nicht in die Quere.

#### 3. Mittlere Nutzung

- Du machst irgendwas dazwischen und wechselst Methoden, je nach dem, wie es
  dir, deinem Projekt oder deine Arbeitsphase passt.
- Du machst dein Ding.
- Leb dein bestes Leben.

<hr>

### 5. Voraussetzungen und Einrichtung

- **Voraussetzungen:** Das Plugin 'Dataview' muss installiert sein, damit
  textFlow funktioniert. Öffne Obsidians
  `Einstellungen > Externe Plugins > Durchsuchen`, dann suche nach `dataview`,
  klicke `Installieren`, dann `Aktivieren` (beides der selbe Button
- **Minimale Obsidian-Version:** 1.4.0 (die erste mit
  [Eigenschaften](#wie-gehen-eigenschaften))
  - Es gibt möglicherweise einen Bug in mindestens einer Version, die älter als
    1.8.10 ist, un dazu führt, dass der Notiztitel dem Inhalt der Notizen
    vorangestellt wird. Falls du dieses Problem in deinen Flows feststellst, sag
    mir bescheid, welche Version du benutzt, damit ich diese Info hier einfügen
    kann.
- **Installation per BRAT:** Während das Plugin noch nicht auf dem Marktplatz
  verfügbar ist, kannst du es manuell oder mit BRAT installieren.
  - **BRAT-Anleitung**: https://tfthacker.com/brat-quick-guide
  - **Manuelle Installation:** Lade `main.js`, `manifest.json`and `styles.css`
    aus dem Release herunter. Erzeuge einen Ordner `textFlow` im
    `.obsidian/plugins` Ordner deines Vaults. Füge die Dateien dort ein. Lade
    deinen Vault neu. Gehe zu Obsidians `Einstellungen > Externe Plugins`. Suche
    nach textFlow. Aktiviere es und klicke das Zahnrad, um zu den Einstellungen
    zu gelangen.
- **Installation per Marktplatz:** Sobald textFlow auf dem Marktplatz verfügbar
  ist: Gehe zu Obsidians `Einstellungen > Externe Plugins > Durchsuchen`, suche
  nach textFlow, klicke `Installieren`, dann `Aktivieren` (beides der selbe
  Button

<hr>

### 6. Einstellungen

- **Grundeinstellungen**
  - **Wähle einen bestehenden Ordner, in dem textFlows Systemordner -
    textFlowSystemFolder - erzeugt werden soll.** Dieser Ordner wird deine Flows
    enthalten. Er ist standardmäßig versteckt, kann aber angezeigt werden.
- **Öffne den Flow-Switcher per...** Hier kannst du auswählen, wie du auf das
  Switcher-Modal zugreifen willst. Es gibt auch die Option, es nur per
  Befehlspalette zu erreichen.
- **Wähle eine Dekoration für den Datei-Explorer.** Die Quellnotizen deiner
  aktiven Flows können im Datei-Explorer markiert werden. Die Markierung kann
  auch versteckt werden.
- **Wähle ein Highlight für die aktive Region.** Die Quellnotiz der aktiven
  Region wird im Datei-Explorer hervorgehoben. Im Stil deiner Wahl.

- **Erweiterte Einstellungen**
  - **Verstecke Explorer-Deko:** Falls du grad keinen Bock drauf hast.
  - **Navigation per Datei-Explorer ausschalten:** Falls du Mehrfachauswahl
    brauchst. Es gibt auch einen Befehl hierfür.
  - **Verstecke die Scrolleiste:** Blende die zuckende Scrolleiste aus -
    entweder in Flows oder überall (also auch für den Datei-Explorer,
    Gliederung, Tag-Ansicht usw.). Es gibt einen Befehl, um zwischen
    überall/nirgendwo zu wechseln.
  - **Prüfe auf externe Bearbeitung:** Falls du öfter mal auf Geräten arbeitest,
    auf denn textFlow nicht läuft, kann das Plugin für dich nach externen
    Bearbeitungen suchen und Flows entsprechend neu bauen.
  - **Verstecke den textFlowSystemFolder:** Es wird empfohlen, den versteckt zu
    halten, damit du nicht versehentlich was dran kaputt machst.

**Erzeuge einen neuen Flow**

- **Gib deinem Flow einen Namen:** Namen müssen einzigartig sein. Sie dürfen
  außerdem bestimmte Zeichen nicht enthalten, da die Namen auch als Datei-Titel
  taugen müssen.
- **Schließe Ordner/Gruppen-Titel ein:** Manche Sortier-Optionen funktionieren
  besser oder schlechter mit Titeln.
- **Definiere deinen Flow per...**
  - **Lesezeichen:** Hier kannst du den Namen bzw. Pfad einer Lesezeichengruppe
    eingeben. Um Untergruppen auszuschließen, beende den Pfad mit einem /.
  - **Pfaden, Tags, [Eigenschaften](#wie-gehen-eigenschaften):** Du kannst
    einschließen oder ausschließen. Du kannst den die Eigenschaften auch mit
    Werten spezifizieren. Die Logik ist allerdings sehr simpel, also wenn du
    kompliziertere Kriterien brauchst, musst du eine Dataview-Such formulieren
    und die Ergebnisse taggen, um sie mit diesem Tag in einen Flow
    einzuschließen.
- **Sortierreihenfolge:** Es steht dir fei, ob du die Notizen in der selben
  Reihenfolge haben willst, wie sie im Datei-Explorer erscheinen, oder ob sie
  lieber der Ordner-Reihenfolge entsprechen sollen. Für Lesezeichen kannst du
  außerdem eine manuelle Ordnung auswählen, bei der die Objekte so verarbeitet
  werden, wie sie in der Übersicht erscheinen, unabhängig davon, ob sie Gruppe
  oder Notiz sind.
- **Vorschau:** Dieser Button öffnet ein Modal, das dir die Ordner/Gruppen-Titel
  und Notiznamen in der Reihenfolge zeigt, in der sie im Flow erscheinen werden.
  Auf diese Weise kannst du prüfen, ob dir das Ergebnis gefällt. Dir wird
  außerdem angezeigt, ob sich dein neuer Flow mit anderen überlappen wird.
- **Speichern:** Das speichert nur die Definition. Das tatsächliche Bauen des
  Flows passiert in einem anderen Schritt.
- **Verwerfe Eingaben:** Setzt die Eingabemaske zurück.

**Deine Flows:**

- Hier siehst du die drei wichtigsten Informationen über deine existierenden
  Flows:
  - Name
  - Quelle
  - Definitionskriterien
- **(Neu)bauen:** Dieser Button baut deine Flow-Notiz nach deinen Vorgaben
  zusammen. Der Button ist außerdem nützlich, um einige Fehlermeldungen
  loszuwerden, da er auch die Datenstruktur im Hintergrund neu erzeugt.
- **Bearbeiten:** Falls du etwas an deiner Definition ändern willst\*\*
- **Löschen:** Löscht deine Definition, die Flow-Notiz (falls sie existiert),
  und alle ihre Spuren in der Datenstruktur.

<hr>

### 7 Befehle

Alle Befehle können in Obsidians Einstellungen mit Tastenkürzeln verknüpft
werden.

- **Alle Leaves synchronisieren:** Speichert auch die aktuelle Cursor-Position
- **Flow im aktive Leaf neubauen:** Manchmal ist ein Neubau außer der Reihe
  nötig.
- **Letzte Cursor-Position wiederherstellen:** Wie die Beschreibung schon sagt.
- **Aktive Region auswählen:** Wählt den Text der aktiven Region des aktiven
  Flows aus.
- **Flow im aktiven Leaf exportieren:** Falls du die Menüleiste nicht aktiviert
  hast.

- **Fuzzy-Navigation öffnen:** Für die Navigation per Tastatur.
- **Flow-Switcher öffnen:** Falls du das Modal nicht mit Buttons öffnen willst,
  kannst du stattdessen diesen Befehl nutzen.
- **Menüleiste umschalten:** Wie die Beschreibung schon sagt.

- Je nach Einstellung (Check für externe Edits aus oder an - Änderungen an
  diesem Setting brauchen einen Reload deines Vaults, um sich hier
  widerzuspiegeln):

  - **Flagge alle Flows für den Neubau:** Falls du keine automatischen Checks
    für externe Edits hast und unsicher bist, welche Notizen du extern
    bearbeitet hast.
  - **Prüfe Vault auf externe Edits:** Falls du auch für deine gerade inaktiven
    Flows einen Check möchtest (die automatischen Checks prüfen nur aktive
    Flows)

- **Scrollbar umschalten:** Für den schnellen Wechsel.
- **Navigation per Explorer umschalten:** Falls du die Mehrfachauswahl brauchst.

<hr>

### 8. Los gehts

#### Gute Angewohnheiten

Wenn du wissen willst, warum: [Sicherheitsfeatures](#2-safetyfeatures) /
[Einschränkungen](#3-einschränkungen-und-bekannte-unannehmlichkeiten)

1. Lass dir Zeit.
2. Öffne so wenige Flows in so wenigen Tabs wie möglich.
3. Sei vorsichtig mit `strg/cmd + z` nach einem Neubau. Es kann dich in den
   Zustand vor dem Neubau zurückbringen.
4. Öffne und bearbeite Flows immer nur in Obsidian und während textFlow aktiv
   ist.

#### Schnelles Tutorial

1. Installiere textFlow Plugin (siehe
   [Voraussetzungen und Einrichtung](#5-voraussetzungen-und-einrichtung))
2. Richte den Systemordner ein.
3. Lies dir die anderen Einstellungen durch, wenn du magst, aber die
   Voreinstellungen sind das empfohlene Setup für neue Nutzer:innen.
4. Scroll runter zu `Erzeuge einen neuen Flow`.
5. Triff eine Auswahl und definiere deinen Flow entweder aus Lesezeichen oder
   aus dem Ordner, den Tags oder anderen Metadaten deiner Notizen.
6. Sieh dir eine Vorschau deiner Schöpfung an.
7. Bau den Flow.
8. Schließe das Einstellungsfenster und öffne das Switcher-Modal.
9. Click auf einen der Pfeil-Buttons, um deinen Flow zu öffnen.
10. Bewundere die Aussicht.
11. Klick herum und beobachte, wie das Navigations-Dropdown deine Bewegungen
    verfolgt. Tippe etwas. Klicke den Sync-Button.
12. Öffne die Quellnotiz und prüfe, ob deine Änderung wirklich gespeichert
    wurde.
13. Starre voll Bewunderung (optional).

#### Wie gehen Eigenschaften

- Öffne eine Notiz deiner Wahl.
- Tippe `cmd + p` für die Befehlspalette und dann das Worte `Eigenschaften`.
- Du siehst den Befehl `Zeige Dateieiegenschaften`
- Den wählst du aus, um die Eigenschaften der Notiz im aktiven Leafs in der
  rechten Seitenleiste anzeigen zu lassen.
- Klick auf `Eigenschaft hinzufügen`.
- Es gibt einige Standardeigenschaften - `tags`, `cssclasses`, and `aliases` -
  die du auswählen kannst. Du kannst aber auch einfach in das Eingabefeld über
  dem kleinen Modal klicken und einen frei gewählten Namen für deine Eigenschaft
  angeben.
- Klick dann auf das Icon mit den drei Strichen. Jetzt kannst du einen Typ für
  deine Eigenschaften aussuchen. Was genau die bedeuten, kannst du selber
  recherchieren, aber die Namen sind recht selbsterklärend.
- Ich empfehle außerdem wärmstens das Plugin 'Multi Properties' von technohiker.
  Damit kannst du die Eigenschaften von mehreren Notizen gleichzeitig
  bearbeiten.

#### Wie geht Fuzzy-Navigation?

**So sehen die Einträge aus:**

- Allgemeine Struktur:
  - `flowName: prefix Pfad/der/Region - crs Cursor Position (LeafID)`
- Beispiele:
  - **Region** des Flows im aktiven Leaf:
    - `AktiverFlowName: ? Pfad/der/Region`
  - **Gespeicherte Cursor-Position** für den Flow im aktiven Leaf:
    - `AktiverFlowName: ? Pfad/der/Region crs 123456 (1a2b3)`
  - **Region** eines anderen Flows:
    - `AndererFlowName: \* Pfad/der/Region
  - **Saved cursor position** for a region of another flow:
    - `AndererFlowName: * Pfad/der/Region - crs 123456 (1a2b3)`
  - **Flowname**:
    - `: FlowName`

**Mit dem Modal navigieren** Ergebnisse für den Flow im aktiven Leaf führen
immer ins aktive Leaf. Ergebnisse für andere Flows versuchen, die mit ihnen
gespeicherte LeafID anzusteuern. Wenn die ID veraltet ist, fallen sie auf das
zuletzt aktive Leaf des Flows zurück. Gibt es auch das nicht, öffnen sie sich in
einem neuen Leaf. Ergebnisse für Flow-Namen öffnen sich immer in einem neuen
Leaf.

Indem du wählst, welches Leaf aktiv ist, wenn du das Modal öffnest, und welches
Ergebnis du klickst, kannst du also recht gezielt navigieren. Um einen Überblick
über deinen Arbeitsbereich (sofern es Flows betrifft) und die involvierten
LeafIDs zu bekommen, öffne das Switcher-Modal.

<hr>

### 9. Probleme beheben

Falls du keine von den Sachen gemacht hast, die zu
[unterlassen](#2-sicherheitsfeatures) ich
[empfohlen](#5-einschränkungen-und-bekannte-unannehmlichkeiten) hatte, kann dein
Problem wahrscheinlich durch Aus- und wieder Anschalten gelöst werden:

- **Baue den problematischen flow neu und/oder**
- **lade deinen Vault neu**

Falls dus einfach selber rausfinden musstest (oder textFlow mit anderen
Einstellungen/Plugins kollidiert oder tatsächlich etwas schiefgegangen ist), ist
hier eine Liste von Problemen, die ich selber verursachen konnte, plus Erklärung
und Lösungen. Falls du dein Problem hier nicht findest, sag bescheid (siehe auch
[Melde einen Bug / Zeig deine Liebe](#12-melde-einen-bug--zeig-deine-liebe))

**Inhaltsverzeichnis**

1. [Flow Erzeugung](#flow-erzeugung)
2. [Flow-Switcher](#flow-switcher)
3. [Menüleiste](#menüleiste)
4. [Flow / Leaf](#flow--leaf)
5. [Komische Sachen](#komische-sachen)
6. [Mehr Probleme](#mehr-probleme)

#### Flow-Erzeugung

- **Problem:** Die Notizen in deiner Preview sind in einer ganz anderen
  Reihenfolge als die die Notizen in deinem Datei-Explorer, obwohl du 'Tiefe
  zuerst' ausgewählt hast, und 'Notizen zuerst' macht es auch nicht besser. Am
  Rande: Diese Benamsung ist verwirrend.
  - **Lösung:**
    - Ich weiß.
    - Benutzt du ein Plugin, um deine Notizen im Datei-Explorer manuell zu
      sortieren
      - Tut mir leid, aber textFlow folgt der tatsächlichen Reihenfolge im
        Dateibaum, nicht der UI-Ebene. Du musst deine Notizen entweder
        numerieren, um die Reihenfolge hinzukriegen, die du willst, oder du
        musst ihre Reihenfolge in einer Lesezeichen-Gruppe spiegeln (vielleicht
        benutzt du ein Plugin, für das du das eh schon so machen musstest?) und
        deinen Flow von da definieren (dann kannst du allerdings die Auswahl
        nicht per Eigenschaften verfeinern).
    - Hast du deine Notizen 'basisname', 'basisname1', 'basisname2'... benannt?
      - JavaScript folgt seinem eigenen Alphabet, bei dem 'basisname' nach
        'basisname${zahl}' folgt
      - Die Lösung ist, 'basisname' in 'basisname0' umzubenennen

#### Flow-Switcher

- **Problem:** Ein Flow will sich nicht öffnen, obwohl er im Switcher angezeigt
  wird.

  - **Lösung:**
    - Versuche, den Flow neu zu bauen und deinen Vault neu zu laden. Wenn der
      Button ausgegraut ist, mache den Neubau in den Einstellungen.
    - Wenn das nicht funktioniert, lösche die Definition des Flows und stelle
      sie aus dem Backup wieder her.
    - Wenn auch das nicht funktioniert, beende Obsidian, gehe in den Ordner
      `.obsidian/plugins/textFlow` in deinem Vault und lösche die Datei
      `data.json`.
    - `.obsidian` ist ein versteckter Ordner, aber das Internet wird dir sagen,
      wie du die auf deinem Betriebssystem sichtbar machen kannst.
    - Danach starte Obsidian neu und stelle deine Flow-Definitionen aus den
      Backups wieder her.

- **Problem:** Das Modal ist leer, obwohl du mehrere Flows definiert hast.
  - **Lösung:**
    - Manchmal frisst Obsidian `data.json` und ich hab keine Ahnung warum. Ich
      hoffe, dass das nur ein Entwicklungsproblem ist und bei tatsächlicher
      Benutzung nicht passiert. Wie dem aus sei:
    - Stelle deine Definitionen aus dem Backup wieder her.
- **Problem:** Ich habe alle Leaves eines Flows per Switcher geschlossen, aber
  der Haupteintrag des Flows wird noch angezeigt.
  - **Lösung:**
    - Ja, das passiert, wenn du deinen Vault neu lädst, während ein Flow offen
      ist, aber keines seiner Leaves aktiv.
    - Öffne einfach ein neues Leaf für den Flow und schließe es wieder.
    - Oder aktiviere ein Leaf des Flows, den du schließen willst, bevor du ihn
      schließt.

#### Menüleiste

- **Problem:** Die Menüleiste wird für einen deiner Flows nur halb gerendert
  (optional: und der Sync-Button bleibt aktiviert)

  - **Lösung:**
    - Versuchs mit nem Neubau. Wenn der Button ausgegraut ist, mach den Neubau
      über die Einstellungen.

- **Problem:** Die Menüleiste ist verschwunden.

  - **Lösung:**
    - Hast du sie verschwinden lassen, indem du den
      Menüleisten-Verschwinde-Befehl benutzt hast? Versuch mal, den Befehl noch
      mal zu benutzen... und noch mal, nur um ganz sicher zu sein.
    - Wenns das nicht war, schließe das betroffene Leaf und bau den Flow neu,
      dann lade deinen Vault neu.
    - Imm noch nix? Benutzt du das Plugin 'Editing toolbar'? Lies den nächsten
      Eintrag.
    - Ist textFlow aktiviert?
    - Sind da irgendwelche Einträge im Switcher-Modal? Falls nicht, sorry,
      Obsidian hat deine Config gegessen. Geh in die Einstellungen und hol deine
      Definitionen aus dem Backup.

- **Problem:** Die Menüleiste wird größtenteils von der Editing toolbar verdeckt

  - **Lösung:**
    - Geh in die Einstellungen von Editing toolbar
    - Unter `General` wähle `body` als `append method`
    - Unter `Appearance` wähle `following` (blendet die Menüleiste ein, wenn du
      Text auswählst) or `fixed` (zeigt die Menüleiste im unteren Drittel des
      Editorfensters).

- **Problem**: Ich habe aus Obsidian raus geklickt während das
  Navigations-Dropdown ausgeklappt war, und jetzt schließt es sich nicht mehr,
  wenn ich außerhalb davon klicke.
  - **Solution:** Ja... keine Ahnung, warum es das tut. Klick einen Menüeintrag,
    das bringt es wieder zur Besinnung.

#### Flow / Leaf

- **Problem:** Du hast einen Flow in einem anderen Text-Editor geöffnet oder
  editiert und jetzt funktionieren Navigation und Tracking nicht mehr oder deine
  Edits werden nicht gesynct.

  - **Lösung:**
    - Dein Text-Editor hat deine UUIDs gelöscht, oder du hast versehentlich eine
      kaputt gemacht.
    - Außerdem hat textFlow keine Ahnung, was du tust, während er nicht tracken
      kann, und weiß auch nicht, was es jetzt für dich syncen soll.
    - Du musst deine Edits von Hand in die entsprechenden Quellnotizen kopieren
      und dann den Flow neu bauen.
    - Lies außerdem das Kapitel über
      [Sicherheitsfeatures](#2-sicherheitsfeatures)

- **Problem:** Der Cursor ist am Ende einer Region, gleich über einer grauen
  Linie, und bewegt sich nicht mehr??

  - **Lösung:**
    - Du hast eine unsichtbare UUID gefunden! Einige der Zeichen, aus denen die
      bestehen, haben Nullbreite, das heißt, der Cursor bleibt, wo er ist,
      während er durch sie hindurch rattert.
    - Um den Cursor zu befreien, klick einfach woanders hin, oder benutze die
      Hoch-/Runter-Pfeiltaste.

- **Problem:** Die grauen Trennlinien sind jetzt aus irgend einem Grund `<hr>`,
  und Checkboxen und anderes Markdown werden nicht mehr gerendert?

  - **Lösung:**
    - Entweder hast du einen ungeschlossenen Code-Block irgendwo.
      - Vielleicht ist es unabsichtlicher Code, wie `<blah`, dann musst du nur
        ein Leerzeichen zwischen die Spitze und die Buchstaben setzen: < blah.
      - Aber wenn es ein ganzer html-artiger Tag ist - `<>` - musst du ihn in
        Backticks (accent gràve) einschließen. Entweder einzlene, wenn du nur
        ein einzelnes Wort isolieren willst - so: `<boolean>`, `<b>` - oder
        drei - ` ``` `- in der Zeile über und der Zeile unter dem Textblock,
        damit Obsidian versteht, dass es nichts interpretieren soll, was in
        diesem Block steht.
    - Oder du hast textFlow deaktiviert, während ein Flow offen war.
      - Das zerstört alle Erweiterungen - obwohl ich
        `reconfigure.of(extension)`, wat soll dat? - und nun kann der Editor
        kein Markdown mehr rendern.
      - Um das zu lösen, schließe das betroffene Leaf oder lade deinen Vault
        neu.

- **Problem:** Du versuchst, den gesamten Flow mit `ctrl+a` zu markieren, aber
  das funktioniert nicht.
  - **Lösung:**
    - Damit das Tracking richtig funktioniert, muss textFlow den Cursor von
      Extrempositionen wie der ersten oder letzten Position in einem Leaf fern
      halten. Das verhindert auch, dass du einen Flow komplett markieren kannst.
    - Da du sicher sowieso keine unsichtbaren UUIDs in deinem kopierten Flow
      haben willst, exportiere ihn stattdessen (es gibt einen Knopf in der
      Menüleiste und auch einen Befehl). Das entfernt die UUIDs für dich und du
      kannst die neue Notiz komplett markieren, wenn du willst.

#### Komische Sachen

- **Problem:** textFlow will, dass ich einen Flow synce, aber wenn ich den
  Button klicke, passiert nichts, und ich kann den Flow nicht neubauen, weil es
  ungesyncte Änderungen gibt.

  - **Lösung:**
    - Hast du gerade einen Sync-Fehler repariert?
    - Öffne textFlows Einstellungen. Hier kannst du Flows immer neu bauen,
      unabhängig vom Sync-Status. Das sollte das Problem beheben.

- **Problem:** Mit jedem Neubau werden die Titel deiner Notizen zu ihrem Inhalt
  hinzugefügt.

  - **Lösung:**
    - Das ist entweder ein Problem mit deinem Setup oder ein Bug in einer (oder
      mehreren) von Obsidians Versionen. Mach ein Update deiner App auf Version
      1.8.10, um zu garantieren, dass das Problem nicht von Obsidian selbst
      ausgelöst wird.
    - Falls der Fehler weiterhin auftritt, schalte all deine Plugins aus und
      dann nach einander wieder ein, während du Neubauten machst, um
      rauszufinden, wer das Problem verursacht
      ([und lass es mich wissen](#12-melde-einen-bug--zeig-deine-liebe))

- **Problem:** Navigation per Datei-Explorer funktioniert nicht, obwohl es
  definitiv angeschaltet ist.
  - **Lösung:**
    - Manchmal frisst Obsidian textFlows data.json und ich hab keine Ahnung,
      warum. Sieh mal nach, ob der Flow-Switcher Flows anzeigt. Wahrscheinlich
      tut es das nicht.
    - Geh in die Einstellungen und stell deine Flow-Definitionen aus den Backups
      wieder her.

#### Mehr Probleme

- **Problem:** Irgend etwas anderes funktioniert nicht und Neubau/neu laden
  hilft nicht.
  - **Lösung:**
    [Schick mir einen Bug-Report](#12-melde-einen-bug--zeig-deine-liebe)

<hr>

### 10. Spickzettel

**Lingo und Konzepte, die textFlow benutzt**

- **Die Grundidee:** textFlow kopiert den Inhalt bestimmter Notizen in eine neue
  Notiz und synchronisiert Änderungen dieser neuen Notiz mit den Originalnotizen
  (Quellnotizen). Und das wars auch schon. Das ist das Plugin. Braucht
  anscheinend trotzdem ein 8.000 Worte Readme...
- **Überlappung:** Eine Überlappung entsteht, wenn zwei oder mehr Flows die
  gleichen Quellnotizen beinhalten. Wenn du die überlappende Region editierst
  und zurück in die Quelle syncst, weicht der zweite Flow vom ersten, sowie den
  Quellen ab. Er wird daher für einen Neubau markiert und neu gebaut, sobald du
  das nächste Mal mit ihm interagierst.
- **Flow:** Eine Notiz, die aus einer Auswahl von Notizen erzeugt (concateniert)
  wurde, und mit UUIDs ausgestattet wurde, um Funktionalität wie das Tracking
  von Cursor-Position und Textänderungen zu ermöglichen, und diese Änderungen in
  die Quelle zurück zu syncen.
- **Eigenschaften:** Oder YAML oder Properties. Metadaten, die du Notizen in
  Obsidian zufügen kannst. Du kannst Eigenschaften benutzen, um sehr spezifische
  Flows zu erstellen. Die Eigenschaften deiner Quellnotizen werden _nicht_ in
  den Flow eingebaut, aber du kannst einem Flow als Ganzes Eigenschaften geben,
  wenn du möchtest.
- **Unsichtbare UUID:** Ein langer String aus verschiedenen, nicht-druckbaren
  und hauptsächlich null-breiten Zeichen, der benutzt wird, um die base16 UUID
  zu repräsentieren, die für jede Quellnotiz erzeugt wird, wenn sie einem Flow
  hinzugefügt wird. Siehe außerdem: Region.
- **Leaf und leafID:** Ein Leaf ist nur ein Tab, plus ein Haufen
  Hintergrund-Information darüber, was in dem Leaf dargestellt wird. Jedes Leaf
  hat eine einzigartige ID, die - so weit es die Durchschnittsuser:in betrifft,
  über Neustarts von Obsidian persistiert. textFlow benutzt LeafIDs, um den
  Überblick darüber zu behalten, welcher Flow wo geöffnet ist, welche Region
  aktiv ist, und welche Cursor-Positionen gespeichert wurden.
- **(Neu)bau:** Der Prozess, bei dem der Inhalt von Quellnotizen in einen Flow
  kopiert wird. Dieser Prozess konstruiert und schreibt den gesamten Flow neu;
  daher kann er für lange Flows mehrere Sekunden dauern.
- **Region:** Der Inhalt einer einzelnen Quellnotiz in einem Flow. Regionen sind
  durch unsichtbare UUIDs markiert, damit textFlow deine Bearbeitungen tracken
  und in die Quelle zurück syncen kann.
- **Quellnotiz:** Eine Notiz, deren Inhalt Teil eines Flows ist.
- **Sychronisation zur Quelle:** Der Prozess, Änderungen aus einem Flow in die
  entsprechende Quellnotiz zurück zu kopieren. Syncing kann automatisch oder
  manuell getriggert werden.
- **Tracken:** textFlow trackt deine Cursor-Position, Maus-Ereignisse und
  Tastatur-Ereignisse, um festzustellen, wo in einem Flow du dich befindest, und
  ob du eine Änderung vorgenommen hat, die Flagging fürs Syncen oder einen
  Neubau notwendig macht. **Dieses Tracking sendet _keine_ Informationen an
  irgendwelche Server**. Es speichert nur Zeug in textFlows `data.json`-Datei in
  deinem `.obsidian/plugins/textFlow`-Ordner. So:

```js
- update: (state, tr) => { let ranges = state.ranges;...}
- this.settings.flows[flowName].activeRegions[leafID].currentCursorPos =
	update.state.selection.main.from;
- this.settings.flows[isItFlow].unsavedRegionsArray.push(activePath);
- this.settings.flows[otherFlow].flaggedForRebuild = true;
```

<hr>

### 11. textFlow und Gliederung im Vergleich

Obsidian hat schon einen Weg, um einzelne, große Dokumente zu browsen, in Form
des Kern-Plugins 'Gliederung' - also wann ist textFlow einen Blick wert? Und
wann solltest du beide zusammen benutzen?

**Die Vorteile von textFlow:**

- **Automation und Flexibilität:**
  - Mit textFlow kannst du an einem Dutzend verschieden zusammengesetzter
    Auszüge deines Vaults arbeiten, ohne jemals etwas von Hand hin und her
    kopieren zu müssen, Teile zu vergessen, Updates zu vergessen, und verwirrt
    darüber zu sein, welche Zusammenstellung welche Version enthält, weil
    textFlow das alles für dich regelt.
- **Datei-Explorer:**
  - Das Plugin 'Quiet outline' von guopenghui erlaubt es dir, Überschriften in
    Outline zu dekorieren und auto-expand klappt die Überschriften aus, unter
    denen du gerade arbeitest. Aber um die Deko zu ändern, musst du dein
    Dokument durchsuchen, anstatt nur im Datei-Explorer zu klicken. Und wenn du
    ein bestimmtes Set an Überschriften ausgeklappt haben willst, musst du
    deinen Arbeitsbereich nach jedem Neustart neu zurecht klicken.
  - Der Datei-Explorer hingegen merkt sich über Neustarts hinweg, welche Ordner
    ausgeklappt waren und welche nicht.
- **Schnappschüsse:**
  - Wenn du einen Schnappschuss eines bestimmten Abschnittes machen willst,
    musst du in Outline per copy/past vorgehen, eine neue Notiz erstellen und
    sie von Hand betiteln.
  - Mit textFlow existieren all deine Quellnotizen noch und du kannst
    Schnappschüsse von jeder machen (versuch mal 'Backitup' von hammadXP -
    funktioniert am besten zusammen mit 'Diff view' von Till Friebe, um
    Versionen zu vergleichen und selektiv wiederherzustellen.)

**Die Vorteile von Outline**

- Keine Daten-Duplikation wie sie für textFlow nötig ist.
- Du kannst deine Dokumente in jedem beliebigen Editor öffnen und bearbeiten,
  wie es dir gefällt.
- Du kannst die Reihenfolge von Abschnitten per Drag-and-Drop ändern, während du
  in textFlow Quellnotizen umbenennen musst, um ihre Reihenfolge zu ändern.
- Wiki-Links funktionieren bereits.
- Durch Überschriften zu navigieren, ist viel robuster als textFlows Navigation
  mit dem Datei-Explorer.
- Du musst niemals darauf warten, dass ein Neubau fertig wird.

**Zusammen sind sie großartig:**

- Warum auswählen, wenn du einfach beide zusammen nutzen kannst? textFlow, um
  flexible Dokumente zu erzeugen und Schnappschüsse zu machen, und die
  Gliederungsansicht, um granular durch deine Flows zu navigieren?

<hr>

### 12. Melde einen Bug / Zeig deine Liebe

Falls dir irgendwelche Bugs oder komisches Verhalten begegnen, die im Kapitel
über das [Beheben von Problemen](#9-probleme-beheben) nicht erwähnt werden,
melde dich auf github: https://github.com/tine-schreibt/aDHL/issues Am besten
kann ich dir helfen, wenn du dir die Fehlermeldungen in der Konsole ansiehst:

- Benutze die Tastenkombination `cmd+alt+i` um sie zu öffnen.
- Dann poste deinen Bug-Report und beschreibe genau, was du tun wolltest und was
  stattdessen passiert ist, inclusive der Fehlermeldungen.
- Du kannst mir auch per email bescheid sagen: tine@tine-schreibt.de - or
  contact me on mastodon: https://literatur.social/@tine_schreibt

Falls du dieses Plugin einfach nur liebst und mir das sagen willst, sind eine
email oder DM ein guter Weg, um das zu tun. Und falls du ein bisschen Knete
übrig hast, kannst du mir auf kofi ein Trinkgeld geben:
https://ko-fi.com/tine_schreibt
