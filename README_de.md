[en version](https://github.com/tine-schreibt/textflow/blob/main/README.md)

### TL;DR

textFlow erlaubt dir **Flows** zu erzeugen - dynamische Dokumente, die aus den
Inhalten mehrerer Notizen bestehen (vergleichbar mit 'Scrivenings'). Flows
können aus Dataview-Queries, aus Ordnern, Tags und Eigenschaften, oder aus
Lesezeichen-Gruppen definiert, und Flows wie jede andere Notiz editiert werden.
Alle Änderungen an Flows und ihren Quellnotizen werden dabei automatisch
registriert und bidirektional gesynct.

textFlow ist vor allem für Autor:innen längerer Texte gedacht, kann aber von
allen genutzt werden, die ihre Texte im größeren Zusammenhang sehen und/oder
editieren wollen.

Die UI hat Optionen sowohl für Tastatur-, als auch für Maus-Navigation.

**UPDATE:** Seit Version 0.4.0 könnt ihr **Flows aus Einbettungen** bauen; das
bedeutet, diese Flows haben keine Datenduplikation mehr. Um Text direkt in euren
Embeds bearbeiten zu können, müsst ihr nur das Plugin
[Sync Embeds von uthvah](https://github.com/uthvah/sync-embeds) installieren und
aktivieren (kann derzeit nur manuell installiert werden).

_Kleine Fixes und einige neue Features mit Bezug auf diese Neuerung kommen über
die nächsten Tage. Jedes Release ist aber stabil und kann ohne große Probleme genutzt werden._

_ Updates für dieses Readme sind ebenfalls noch nicht vollständig
ausgearbeitet._

Bitte beachtet, dass ich (außerhalb der Funktionen, die ich gerade erst
implementiere) textFlow nach bestem Wissen und Gewissen durchgetestet habe, aber
ihr seid die ersten echten User. Daher kann ich nicht garantieren, dass ihr
nicht doch noch den einen oder anderen Bug findet, den ich übersehen habe. Hier
ist eine [Anleitung zur Fehlerbehebung](#9-probleme-beheben), in die ihr
reinschauen könnt, bevor ihr einen
[Bug Report ](#12-melde-einen-bug--zeig-deine-liebe) einreicht.

Bitte lasst außerdem Obsidians Datenwiederherstellungs-Plugin,
['Edit history' von Antonio Tejada](https://github.com/antoniotejada/obsidian-edit-history)oder
einen anderen Echtzeit-Backup-Service mitlaufen - zumindest bis sich textFlow
dein Vertrauen verdient hat. (Aber eigentlich solltet ihr immer Backups
mitlaufen lassen, egal was ihr tut. Immer. Bitte macht Backups! o.o)

---

**Du willst gleich loslegen?**

- [Voraussetzungen und Einrichtung](#5-voraussetzungen-und-einrichtung)
- [Los gehts](#8-los-gehts)
- [Probleme beheben](#9-probleme-beheben)

**Du willst erstmal wissen, was du eigentlich bekommst und wie du textFlow
stressfrei benutzen kannst?**

1. [Funktionalität](#1-funktionalität)
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

### 1. Funktionalität

##### Bereits implementiert:

1. **'Intelligente' Flows:** Definiere Flows aus Lesezeichen-Gruppen, oder indem
   du Ordner, Tags und [Eigenschaften](#wie-gehen-eigenschaften) als
   Ein/Ausschluss-Kriterien benutzt. textFlow kopiert die entsprechenden Notizen
   für dich in einer neuen Notiz zusammen (einem Flow) und markiert sie mit
   unsichtbaren UUIDs, um Textänderungen zu verfolgen.
   - **Praktisch:**
     - Alle Flows, werden automatisch geprüft, wenn du in ihrem Quellodner,
       einer ihnen zugehörigen Notiz oder einen zugehörigen Ordner verschiebst,
       hinzufügst oder löschst, und bei Bedarf für den Neubau geflaggt. Für
       Flows, die aus Dataview-Queries oder Lesezeichen definiert wurden,
       funktioniert dies nur eingeschränkt; manuelles Neubauen ist aber
       jederzeit möglich.
     - Rechts-Klick auf einen Ordner gibt die Option:
       `textFlow: Erzeuge neuen Flow aus diesem Ordner`. Das Ganze funktioniert
       auch für eine Mehrfachauswahl von Ordnern. Du kannst die Definition
       danach in den Einstellungen mit Tags und Eigenschaften verfeinern.
2. **Strukturiere deine Flows:**
   - Flows, die über Ordner, Tags oder Eigenschaften definiert sind, habe zwei
     Sortieroptionen:
     1. Spiegle die Reihenfolge der _Notizen_, wie sie im Explorer
        auftauchen[\*](#keine-manuelle-sortierung).
     2. Spiegle die Reihenfolge der _Ordner_, wie sie im Explorer
        auftauchen[\*](#keine-manuelle-sortierung).
   - Flows, die aus Lesezeichen-Gruppen definiert sind, sind nicht an die
     alphanumerische Ordnung gebunden und können auch die manuelle Reihenfolge
     der Objekte im Ordner spiegeln, unabhängig davon, ob sie Notizen oder
     Ordner sind. Benutze die Reihenfolge, die sich für dich intuitiver/weniger
     verwirrend anfühlt, oder besser zum jeweiligen Flow passt. Manche
     Reihenfolgen funktionieren außerdem besser ohne Ordner-/Gruppen-Titel.
3. **Embeds**: Wenn du das Plugin
   [sync-embeds von uthvah](https://github.com/uthvah/sync-embeds) installierst,
   wird dein Flow aus editierbaren Einbettungen gebaut, die automatisch mit den
   Quellnotizen gesynct werden.
4. **Bearbeite Flows wie jede andere Notiz:** Wenn du deinen Flow nicht aus
   embeds baust, beobachtet textFlow, in welcher Region eines Flows eine
   Änderung stattfindet, und synchronisiert sie automatisch in die richtige
   Quellnotiz zurück, sobald du in eine andere Notiz klickst. Du kannst auch
   jederzeit manuell syncen (es gibt einen Befehl dafür, den du mit einem
   Tastenkürzel verbinden kannst).
5. **Füge deinen Flows Eigenschaften hinzu:** Benutze dazu einfach wie gewohnt
   das Eigenschaften-Plugin. Eigenschaften bleiben erhalten, wenn du deinen Flow
   neu baust, und sie sind nützlich, wenn du über die Ansicht in den
   Settings/dem FlowSwitcher-Modal hinaus den Überblick behalten willst.
6. **Flows sind wirklich nur eine weitere, gewöhnliche Notiz mit ein bisschen
   API-Bling dran:** Also _so gut wie alles funktioniert in deinen Flows:_ Deine
   Themes funktionieren. Inline-styles funktionieren. Dataview-Tabellen werden
   wie gewohnt angezeigt. Die Gliederungsansicht funktioniert (okay,
   [zu 99%](#3-einschränkungen-und-bekannte-unannehmlichkeiten)). Suche in
   Notizen funktioniert. Callouts, Listen, Code-Blöcke, Tabellen, alles
   funktioniert. Weil - wie gesagt - ein Flow ist nur eine ganz normale Notiz
   mit ein bisschen API-Bling dran.
7. **Navigiere innerhalb deiner Flows mit dem Datei-Explorer:** Yup. Ich weiß!
   textFlow kann sogar die Quellnotiz der aktiven Region in einem von sechs
   Styles hervorheben.
   [Es ist allerdings nicht perfekt...](#3-einschränkungen-und-bekannte-unannehmlichkeiten)
8. **Ein Fuzzy-Navigation Modal:** Wenn du es gewohnt bist, Obsidians
   Schnellauswahl zu benutzen, wirst du dich hier wie zuhause fühlen - mit ein
   paar netten Tricks obendrauf:
   - Setze `?` vor deine Suche, um sie auf den Flow im aktiven Leaf zu
     beschränken
   - `*` um in den Flows zu suchen, die _nicht_ im aktiven Leaf sind
   - `:` um in Flow-Namen zu suchen
   - oder nichts, um alles gleichzeitig zu durchsuchen Details zu den
     Navigationsregeln des Modals findest du hier:
     [Wie funktioniert das Fuzzy-Navigation Modal](#-wie-geht-fuzzy-navigation)
9. **Mach Zeug mit der Menüleiste:**
   1. Sie hat Buttons zum **syncen** und **neubauen**.
   2. **Ein Navigationsmenü:** Dieses Dropdown macht es leicht,
      unzusammenhängende Flows zu navigieren - oder falls dir die
      Explorer-Navigation zu fickelig ist. Das Menü hat auch eine Fuzzy Search,
      damit du schneller findest, wo du hin willst. Der Suchbegriff persistiert
      innerhalb einer Session, damit du ihn nicht ständig neu eintippen muss.
   3. **Deinen Cursor-Verlauf:** Wenn du syncst, speichert textFlow die aktuelle
      Cursor-Position (für die letzten paar Regionen und Leaves eines Flows), so
      dass du schnell hin und her springen kannst. textFlow merkt sich außerdem
      die Cursor-Position über Reloads hinweg, und es gibt einen Befehl, um
      automatisch zur letzten bekannten Position des aktiven Leafs zu springen.
   4. **Einen Auswahl-Button für die aktive Region:** Nur für non-embed Flows.
      Falls du eine Copy/Paste-Operation brauchst. Auch hierfür gibt es einen
      Befehl.
   5. **Einen Export-Button:** Dieser Button erzeugt eine Kopie deines Flows -
      ohne UUIDs. Sie wird in deinem Root-Ordner abgelegt und mit Flow-Namen und
      Zeitstempel betitelt. Wenn du einen embed Flow exportierst, werden die
      Embeds durch tatsächlichen Notizeninhalt ersetzt.
   6. **Ein Min/Max-Button:** Damit du die Menüleiste bei Bedarf minimieren
      kannst. Es gibt auch einen Befehl, um sie zu togglen. Minimiert ist die
      Menüleiste nur ein kleines graues Chevron oben links im Editor - oder ein
      Warndreieck, solange der Flow noch nicht fertig eingerichtet ist. (Geh mit
      der Maus darüber, falls es nicht von allein verschwindet.)
10. **Mach Zeug mit dem Switcher-Modal:** Im FlowSwitcher gibt es Buttons um:
    - Flows in einem neuen Tab oder Split zu öffnen
    - zwischen offenen Tabs mit Flows zu springen
    - schnell mehrere Tabs mit Flows zu schließen
    - inaktive Flows neu zu bauen
11. **Kleinigkeiten:**
    - Du kannst die Scrolleisten verstecken.
    - Rechtsklick in den Datei-Explorer gibt die Option eine neue Datei im
      aktuellen Ordner zu erzeugen (das ist im Grunde nur für mich -.-)

##### Kommt vielleicht in der Zukunft, wenn genug Leute [danach fragen](https://github.com/tine-schreibt/textFlow/issues):

- **Export mit Eigenschaften:** Eigenschaften eines Flows beim Export mitnehmen.
- **Frei wählbarer Export-Ordner:** Setze einen anderen Ordner als root für
  exportierte Ordner.
- **Favoriten für das Switcher-Modal:** Falls du eine metrische Tonne Flows
  hast, Hilfe brauchst, um nicht den Überblick zu verlieren, und
  Eigenschaften/Dataview dir unheimlich sind.
- **Tags und Properties für Lesezeichen-Flows:** Damit du sie einschränken
  kannst, falls du sie nur angelegt hast, um dein Zeug im Datei-Explorer manuell
  zu sortieren.
- **Rechtsklick definiere Flow aus Lesezeichen-Gruppe:** So dass es hier die
  gleiche Bequemlichkeit gibt wie für Ordner im Datei-Explorer
- **Handgemachte Flows:** Die Möglichkeit, eine beliebige Dateiliste als Quelle
  für Flows einzugeben.
- **Tags und Properties für handgemachte Flows:** Für Leute die Plugins mit
  Dateilisten für die manuelle Sortierung benutzen.
- **Umleitung für interne Links:** Ein Eintrag im Kontext-Menü von internen
  Links, der es erlaubt, den Link in einem Flow anstatt in der eigentlich
  adressierten Notiz zu öffnen.

Sofern ich von allein Motivation entwickle, könnten sie eines Tages auch einfach
so auftauchen.

**Außerdem:**

- **Mehr Sprachen:** Bisher gibt es das Plugin nur auf Deutsch und Englisch.
  Falls du eine weitere Sprache beisteuern willst:
  [https://github.com/tine-schreibt/textFlow/tree/main/plugin/src/lang](https://github.com/tine-schreibt/textFlow/tree/main/plugin/src/lang)

<hr>

### 2. Sicherheitsfeatures

1. **Die Menüleiste:** Die Existenz der Menüleiste zeigt an, dass das Plugin
   aktiv ist. Darüber hinaus checkt die Leiste, ob der CodeMirror-Bling korrekt
   angebracht wurde. Ist das mal (noch) nicht der Fall, wird statt des
   Min/Max-Chevrons ein Warndreieck angezeigt. Falls du dieses Dreieck mal
   siehst, fahr mit der Maus darüber, um Anweisungen zu erhalten.
2. **Unsichtbaren UUIDs sind schreibgeschützt:** UUIDs sind zufällige Strings
   aus 46 nicht-druckbaren Zeichen, die textFlow am Ende des Inhalts einer jeden
   Quelldatei platziert, um die Cursor-Position relativ dazu zu tracken. Sie
   sind schreibgeschützt, um ihre Integrität (und damit die Integrität deines
   Flows und deiner Quelldateien) zu garantieren. Dieser Schutz ist natürlich
   nicht gegeben, wenn du einen Flow außerhalb von textFlows Kontext
   bearbeitest. Manche Texteditoren löschen nicht-druckbare Zeichen auch
   einfach, so dass schon das Öffnen eines Flows in so einem Editor seine
   Integrität zerstört.
3. **Integritätstest für Flows:** Wann immer du einen Flow öffnest, und dieser
   nicht im Öffnen neu gebaut wird, prüft textFlow die in der Datei enthaltenen
   UUIDS. Fehlen welche/sind beschädigt, sagt es bescheid, so dass du den Flow
   neu bauen kannst.
4. **Flows werden von Obsidian gespeichert:** Da Flows - was Obsidian angeht -
   nur ganz gewöhnliche Notizen sind, werden sie auch wie alle anderen Notizen
   gespeichert. Das bedeutet, dass deine Arbeit in einem Flow genau so sicher
   ist wie in jeder anderen Notiz, und du bei einem Crash von Obsidian nichts
   verlierst.
5. **Automatisierung:**
   1. **Auto-Sync:** Wann immer du das Leaf wechselst, werden all deine neuen
      Textänderungen automatisch in die entsprechende Quelldatei zurück gesynct.
      Du kannst auch jederzeit von Hand syncen; es gibt dazu einen Befehl.
   2. **Auto-Neubau:** Wann immer du ein Leaf fokussierst, das einen für den
      Neubau vorgemerkten Flow enthält, wird automatisch ein Neubau getriggert.
      - **Ein Flow wird für den Neubau markiert...**
        1. ... wenn du Notizen oder Ordner, umbenennst, verschiebst, erzeugst
           oder löschst, die Teil eines Flows sind oder es wahrscheinlich sein
           werden.
        2. ... wenn du zwei überlappende Flows geöffnet hast und die
           überlappende Regionen bearbeitest. **WICHTIG:** _Das ist wirklich
           **nur eine Sicherheitsvorkehrung** für versehentliche Edits, und
           nicht dazu gedacht, ausgenutzt zu werden, um routinemäßig in
           Überlappungen zu arbeiten; **der Mechanismus wird sogar instabil**,
           wenn ein Flow neu gebaut wird, während er in mehr als einem Leaf
           geöffnet ist._ Also wenn dir textFlow mitteilt, dass sich dein Cursor
           in einer Überlappungsregion befindet, schließe den überlappenden
           Flow, ehe du sie editierst.
        3. ... wenn du eine Quellnotiz direkt editierst (auch wenn du nur
           irrelevante Eigenschaften bearbeitest, sorry)
      - **Alle Neubauten sind vollständige Neubauten:** Die gesamte
        Datenstruktur im Hintergrund des Flows wird neu berechnet, UUIDs werden
        neu generiert, und der Flow wird komplett neu geschrieben, so dass die
        Integrität garantiert ist und die alte und neue Version auch für
        textFlow unterscheidbar sind. Du kannst also informiert werden, solltest
        du mal per `strg/cmd+z` in eine alte Version zurückgesprungen sein.
      - **Um exzessive Neubauten zu vermeiden:**
        - Halte nur Flows offen, an denen du aktiv arbeitest. Einen Flow mit all
          seinen Leaves zu schließen, braucht nur einen Klick ins
          Switcher-Modal, und das Öffnen geht ebenso schnell. Denke auch darüber
          nach, evtl. Flows in verschiedenen Arbeitsbereichen zu behalten.
        - Vermeide es, an überlappenden Regionen zu arbeiten.
        - Schließe die betroffenen Flows bevor du
          - an mehreren Quellnotizen arbeitest,
          - deine Quellordner umsortierst,
          - die Eigenschaften vieler Notizen editierst.
6. **Neubau prüft Quellnotizen auf UUIDs:** Wenn bei einer Synchronisation etwas
   schief geht, resultiert es gewöhnlich darin, dass mehrere Regionen mitsamt
   ihren UUIDs in eine einzelne Quellnotiz kopiert werden. Deshalb sucht die
   Neubau-Funktion in allen Notizen nach UUIDs. Wird eine gefunden, stoppt der
   Neubau und informiert dich, so dass du das Problem beheben kannst.
7. **textFlows Ordner ist geschützt:** Der Ordner, in dem textFlow deine Flows
   aufhebt, ist standardmäßig versteckt. Du kannst ihn anzeigen lassen, wenn du
   Flows direkt daraus öffnen willst; textFlow hat genaue Vorstellungen davon,
   was du in diesem Ordner anstellen darfst, und es wird Änderungen, die es
   nicht mag, lautstark rückgängig machen.
8. **Automatische Prüfung auf externe Bearbeitung von Quellnotizen:** Falls du
   öfter mal Quellnotizen auf Geräten bearbeitest, auf denen textFlow nicht
   läuft (z.B. deinem Handy oder Tablet), kann textFlow für dich Folgendes
   prüfen:
   - **Zeitstempel der letzten Bearbeitung** - das reicht für die meisten Use
     Cases aus und ist die Standardeinstellung
   - **Zeitstempel und Hash** - das kannst du aktivieren, wenn zu viele unnötige
     Neubauten getriggert werden
   - **Immer den Hash** - nützlich, wenn du deinem Sync-Service nicht traust,
     oder in einem riskanten Setting arbeitest (z.B. mit git oder einem
     'intelligenten' / speichersparenden / streaming Sync-Service).

   **Diese automatischen Checks laufen**
   - wenn ein Flow geöffnet wird,
   - wenn du nach mindestens 5 Minuten der Inaktivität in Bezug auf einen Flow
     wieder mit diesem interagierst (Leaf aktivieren oder Textänderung),
   - und wenn du in eine neue Region klickst (dann allerdings nur für diese
     Region). Falls es dir wichtig ist, kannst auch alle deine Flows manuell per
     Befehl prüfen.

   **HINWEIS:** Diese Checks funktionieren natürlich nur, wenn du deinem
   Sync-Service auch die nötige Zeit lässt, seine Arbeit zu tun. Also achte
   darauf, dass die Sync deines Vaults abgeschlossen ist, ehe du weiter
   arbeitest.

9. **Manuelle Markierung für Neubau:** Wenn du automatische Checks deaktivierst,
   kannst du immer noch per Rechtsklick auf eine Notiz im Datei-Explorer
   auswählen, dass alle Flows, die sie enthalten, für den Neubau markiert werden
   sollen.
10. **Definitions-Backup:** Falls du das Plugin mal komplett deinstallieren und
    neu installieren musst, kannst du ein Backup deiner Flow-Definitionen
    erzeugen. Dieses wird in Form einer .json-Datei in textFlows Ordner in
    deinem Vault abgelegt.

<hr>

### 3. Einschränkungen und bekannte Unannehmlichkeiten

#### Erwähnte Sachen zuerst

#### Keine manuelle Sortierung:

- Wenn du die Notizen/Ordner in deinem Datei-Explorer manuell sortiert hast,
  kann dies nicht in Flows reflektiert werden. Das kommt daher, dass textFlow
  Dataview benutzt, das wiederum auf den alphanumerischen Dateibaum auf
  Systemebene zugreift, und nicht auf Sortierungen, die auf UI-Ebene passieren.
- Falls du deine Ordner und Notizen absolut nicht durchnumerieren willst (dabei
  ist das so viel robuster...), kannst du deine manuelle Sortierung in einer
  Lesezeichengruppe spiegeln und deine Flows aus diesen heraus definieren
  (einige Plugins für manuelle Sortierung basieren eh auf Lesezeichen, also...).
  Du kannst allerdings (derzeit noch?) keine Eigenschaften benutzen, um eine auf
  Lesezeichen basierende Definition zu verfeinern.

**Eingebettete Flows und das Cursor-Tracking:** Da der Inhalt von Einbettungen
in ihrem eigenen, sekundären Editor leben, kann textFlows Cursor-Listener nicht
mehr 'sehen', wo der Cursor ist, wenn er sich innerhalb einer Einbettung
befindet. Damit das Navigations-Dropdown und der Datei-Explorer die korrekte
Region anzeigen, wenn du manuell durch deinen Flow navigierst, musst du einmal
außerhalb der Einbettung klicken.

**Keine automatischen Checks bei Bearbeitung von Lesezeichen-Gruppen:**

- Obsidian sagt nicht bescheid, wenn du die Reihenfolge oder Zusammensetzung
  einer Lesezeichen-Gruppe änderst. Das heißt, du musst die betroffenen Flows
  von Hand markieren/neu bauen. Das geht aber schnell, denn du kannst den Befehl
  benutzen, um alle Flows zu markieren, oder per FlowSwitcher Modal ausgewählte
  Flows neu baust.

**Zeug in der Gliederungsansicht umsortieren:**

- Da der letzte Abschnitt in einer Region immer auch die schreibgeschützte UUID
  umfasst, kann dieser Abschnitt nicht per drag-and-drop verschoben werden.
  Alles dazwischen kannst du aber wie gewohnt rumschieben.

**Die Grenzen der Navigation per Datei-Explorer:**

1. **Fokus:** Navigation ist vom Fokus auf ein Leaf abhängig, und der ist ein
   unbeständiges Biest. Also musst du in das Leaf klicken und einmal tief
   durchatmet, um der UI Zeit zu geben, sich zu sortieren, ehe du in den
   Datei-Explorer klickst. Die nächsten Klicks funktionieren meist, aber
   manchmal musst du neu fokussieren, indem du wieder ins Leaf klickst. Manchmal
   streikt der Listener auch aus irgend einem Grund komplett? Dann hilft nur ein
   Neustart von Obsidian.
2. **Interferenzen**:
   1. **Mehrfachauswahl:** Die Mehrfachauswahl per alt-Taste funktioniert wie
      gewohnt, aber die Mehrfachauswahl per Hochstelltaste ist gern mal verwirrt
      darüber, welches Element denn nun den Start der Auswahl darstellt. Also
      falls du mit Hochstelltaste auswählen willst, schalte die Navigation per
      Explorer in den Settings aus (es gibt auch einen Befehl dafür).
   2. **Andere Plugins:** Falls du noch weitere Plugins benutzt, die verändern,
      wie Klicks in den Datei-Explorer gehandhabt werden, ist es möglich, dass
      einiges davon nicht mehr richtig funktioniert. Also falls du da Probleme
      hast, versuch mal, textFlows Klick-Listener abzuschalten.

#### Der andere Kram:

1. **Notwendige Duplikation von Daten:** Sofern ihr eure Flows nicht mit
   Einbettungen baut, sind Flows zusätzliche Notizen, die den Inhalt ihrer
   Quellnotizen replizieren; nur so funktioniert das alles. Deine Flows werden
   allerdings in einem dedizierten, frei platzierbaren Ordner gespeichert, der
   standardmäßig versteckt ist. Wenn Datenduplikation dein Blut trotzdem zum
   Kochen bringt, ist dieses Plugin nicht das richtige für dich, und du magst
   dir eher
   [Continuous Mode](https://github.com/gasparschott/obsidian-continuous-mode)
   oder [sync-embeds](https://github.com/uthvah/sync-embeds/) mal anschaun.

##### Da kann mein Plugin nichts für

1. **Implizite Größenbeschränkung für Flows:** Obsidian handhabt offene Notizen
   im RAM. Wenn du also dein Viertelmillion Worte langes Epos offen hast - sei
   es in einem einzigen Flow oder auf mehrere verteilt - kann die UI langsam
   werden. Da hilft nur, deine Flows eher klein zu halten und nur zu öffnen, was
   du tatsächlich grad brauchst. Zum Vergleich: Dein unfertiger 50.000-Wort
   Roman hat unter 400kB, während dein 250.000-Wort Epos die 2MB knacken dürfte.
2. **Alphanumerisch ist relativ:** Falls du deine Notizen so benamst:
   'basisname', 'basisname 1', 'basiname 2' usw. erscheinen sie zwar im
   Datei-Explorer, wie man es erwarten würde, aber JavaScript ist der Ansicht,
   dass 'basisname' _nach_ 'basisname 1' kommt. In deinem Flow werden also alle
   numerierten Notizen vor der unnumerierten kommen. Lösung: 'basisiname 0'.
3. **Kein Auto-Sync wenn du Obsidian schließt:** Onunload gibt Obsidian Plugins
   kaum Zeit, ihren Kram aufzuräumen und Einstellungen zu speichern, geschweige
   denn, komplette Dateien zu schreiben. Aber deine Flows werden immer genau so
   gespeichert wie alle anderen Dateien in Obsidian, und du kannst die sync
   nachholen, wenn du Obsidian wieder startest.
4. **textFlows Menüleiste überlappt manchmal Editing Toolbar oder die
   Sucheingabe oder wird von der Sucheingabe überlappt:** Aufgrund gewisser
   Eigenheiten von CSS und Obsidian ist es leider nicht so einfach möglich,
   Menüleisten und die Sucheingabe friedlich coexistieren zu lassen. Der
   gegenwärtige Zustand stellt ein Optimum dar, und die meisten Überlappungen
   können behoben werden, indem du textFlows Menüleiste minimierst und wieder
   maximierst.
   - Die Ausnahme: Die minimierte textFlow Menüleiste verdeckt immer, was auch
     immer darunter liegt. Aber der Button ist winzig und sollte nicht die
     Funktionalität einschränken.

<hr>

### 4. Use Cases

- Du bist eine Autor:in und möchtest deine Notizen/Kapitel/Szenen in diversen
  Kontexten sehen/bearbeiten
- Du möchtest diverse Kontexte zusammenstellen, um auf bestimmte Aspekte deines
  Arbeit zu fokussieren.
- Du möchtest die Gesamtheit oder bestimmte Ausschnitte deiner Arbeit in eine
  einzige Datei packen, um sie mit anderen zu teilen
- Du willst im Grunde Scrivenings für Obsidian

<hr>

### 5. Voraussetzungen und Einrichtung

- **Voraussetzungen:** Das Plugin 'Dataview' muss installiert sein, damit
  textFlow funktioniert. Öffne Obsidians
  `Einstellungen > Externe Plugins > Durchsuchen`, dann suche nach `dataview`,
  klicke `Installieren`, dann `Aktivieren` (beides der selbe Button).
- **Minimale Obsidian-Version:** 1.4.0 (die erste mit
  [Eigenschaften](#wie-gehen-eigenschaften))
  - Es gibt möglicherweise einen Bug in mindestens einer Version, die älter als
    1.8.10 ist, und dazu führt, dass der Notiztitel dem Inhalt jeder Notizen
    vorangestellt wird. Falls du dieses Problem in deinen Flows feststellst, sag
    mir bescheid, welche Version du benutzt, damit ich diese Info hier einfügen
    kann.
- **Installation ohne Marktplatz:** Während das Plugin noch nicht auf dem
  Marktplatz verfügbar ist, kannst du es manuell oder mit BRAT installieren.
  - **BRAT-Anleitung**: https://tfthacker.com/brat-quick-guide
  - **Manuelle Installation:**
    - Lade `main.js`, `manifest.json`and `styles.css` aus dem Release herunter.
    - Erzeuge einen Ordner `textFlow` im `.obsidian/plugins` Ordner deines
      Vaults (wie du versteckte Ordner auf deinem System sichtbar machen kannst,
      verrät dir das Internet).
    - Füge die Dateien dort ein.
    - Lade deinen Vault neu.
    - Gehe zu Obsidians `Einstellungen > Externe Plugins` und suche nach
      textFlow.
    - Aktiviere es und klicke das Zahnrad, um zu den Einstellungen zu gelangen.
- **Installation per Marktplatz:** Sobald textFlow auf dem Marktplatz verfügbar
  ist:
  - Gehe zu Obsidians `Einstellungen > Externe Plugins > Durchsuchen`.
  - Suche nach textFlow, klicke `Installieren`, dann `Aktivieren` (beides der
    selbe Button).

<hr>

### 6. Einstellungen

- **Speicherort für textFlowSystemFolder:** Wähle einen bestehenden Ordner, in
  dem textFlows Systemordner - textFlowSystemFolder - erzeugt werden soll.
  Dieser Ordner wird deine Flows enthalten. Er ist standardmäßig versteckt, kann
  aber angezeigt werden.
- **Standard der Menüleiste:** Wie soll die Menüleiste in neu geöffneten Flows
  angezeigt werden?
- **Öffne den Flow-Switcher per...** Wie möchtest du auf das Flow-Switcher-Modal
  zugreifen?
- **Dekoration für den Datei-Explorer:** Wie sollen die Quellnotizen deiner
  aktiven Flows im Datei-Explorer markiert werden?
- **Highlight für die aktive Region im Datei-Explorer:** Sieben Stile, aus denen
  du auswählen kannst (inklusive 'keiner').

- **Mehr...**
  - **Navigation per Datei-Explorer einschalten:** Es gibt auch einen Befehl
    dafür.
  - **Scrollbar verstecken:** Blende die zuckende Scrolleiste aus. Es gibt auch
    einen Umschalt-Befehl.
  - **Prüfe auf externe Bearbeitung:** Falls du öfter mal auf Geräten arbeitest,
    auf denen textFlow nicht läuft, kann das Plugin für dich nach externen
    Bearbeitungen suchen und Flows entsprechend neu bauen.
  - **textFlowSystemFolder anzeigen:** Es wird empfohlen, ihn versteckt zu
    halten, damit du nicht versehentlich was dran kaputt machst.

**Definiere einen neuen Flow**

- **Gib deinem Flow einen Namen:** Namen müssen einzigartig sein. Sie dürfen
  außerdem bestimmte Zeichen nicht enthalten, da die Namen auch als Datei-Titel
  taugen müssen.
- **Schließe Gruppen-/Ordnertitel ein:** Manche Sortier-Optionen funktionieren
  besser oder schlechter mit Titeln.
- **Definiere deinen Flow per...**
  - **Dataview Query:** Vanilla Queries ohne JS.
  - **Ordner, Tag, [Property](#wie-gehen-eigenschaften):** Du kannst
    einschließen und/oder ausschließen.
  - **Lesezeichengruppe:** Hier kannst du den Namen bzw. Pfad einer
    Lesezeichengruppe eingeben.
- **Sortierreihenfolge:** Es steht dir frei, ob du die Notizen in der selben
  Reihenfolge haben willst, wie sie im Datei-Explorer erscheinen, oder ob sie
  lieber der Ordner-Reihenfolge entsprechen
  sollen[\*](#keine-manuelle-sortierung). Für Lesezeichen kannst du außerdem die
  manuelle Ordnung auswählen, die du deinen Lesezeichen und Ordnern gegeben
  hast.
- **Vorschau:** Dieser Button öffnet ein Modal, das dir die Gruppen-/Ordnertitel
  und Notiznamen in der Reihenfolge zeigt, in der sie im Flow erscheinen werden.
  Dir wird außerdem angezeigt, ob sich dein neuer Flow mit anderen überlappen
  wird.
- **Speichern:** Das speichert die Definition und baut den Flow.
- **Verwerfe Eingaben:** Setzt die Eingabemaske zurück.

**Deine Flow-Definitionen:**

- Hier siehst du die drei wichtigsten Informationen über deine existierenden
  Flows:
  - Name
  - Quelle
  - Definitionskriterien
- **Neubauen:** Dieser Button baut deine Flow-Notiz nach deinen Vorgaben
  zusammen. Benutze ihn, falls mal was mit der Menüleiste oder dem FlowSwitcher
  nicht funktioniert.
- **Bearbeiten:** Falls du etwas an deiner Definition ändern willst.
- **Löschen:** Löscht deine Definition, die Flow-Notiz (falls sie existiert),
  und alle ihre Spuren in der Datenstruktur (außer in deinem Backup).
- **Stelle alte Flow-Definitionen wieder her:** Hier kannst du ein Backup deiner
  Flow-Definitionen erzeugen und alte Definitionen wiederherstellen. Das Backup
  wird als .json-Datei in textFlowSystemFolder abgelegt. In Obsidian ist die
  Datei also nicht sichtbar.

<hr>

### 7 Befehle

Alle Befehle können in Obsidians Einstellungen mit Tastenkürzeln verknüpft
werden.

- **Alle Leaves synchronisieren:** Speichert auch die aktuelle Cursor-Position.
- **Flow im aktive Leaf neubauen:** Manchmal ist ein Neubau außer der Reihe
  nötig.
- **Letzte Cursor-Position wiederherstellen:** Wie die Beschreibung schon sagt.
- **Aktive Region auswählen:** Wählt den Text der aktiven Region des aktiven
  Flows aus.
- **Flow im aktiven Leaf exportieren:** Falls du die Menüleiste nicht aktiviert
  hast.

- **Fuzzy-Navigation öffnen:** Für die Navigation per Tastatur
- **Flow-Switcher öffnen:** Falls du das Modal nicht mit Buttons öffnen willst,
  kannst du stattdessen diesen Befehl nutzen.
- **Menüleiste umschalten:** Wechselt zwischen min/max für die Menüleiste.

- **Flagge alle Flows für den Neubau:** Falls du keine automatischen Checks für
  externe Edits hast und unsicher bist, welche Notizen du extern bearbeitet
  hast.
- **Prüfe Vault auf externe Edits:** Falls du auch für deine gerade inaktiven
  Flows einen Check möchtest (die automatischen Checks prüfen nur aktive Flows,
  bzw. Flows die geöffnet werden).

- **Scrollbar umschalten:** Für den schnellen Wechsel.
- **Navigation per Explorer umschalten:** Falls du die Mehrfachauswahl brauchst.

<hr>

### 8. Los gehts

#### Gute Angewohnheiten

Wenn du wissen willst, warum: [Sicherheitsfeatures](#2-safetyfeatures) /
[Einschränkungen](#3-einschränkungen-und-bekannte-unannehmlichkeiten)

1. Warte, bis die Menüleiste dargestellt wird und das Warndreieck verschwunden
   ist, ehe du anfängst, zu arbeiten. Geh mit der Maus über das Dreieck für eine
   Anleitung, falls es nicht von allein verschwindet.
2. Öffne so wenige Flows in so wenigen Tabs wie möglich.
3. Öffne und bearbeite Flows immer nur in Obsidian und während textFlow aktiv
   ist.

#### Schnelles Tutorial

1. Installiere textFlow Plugin (siehe
   [Voraussetzungen und Einrichtung](#5-voraussetzungen-und-einrichtung))
2. Öffne die Settings und richte den Systemordner ein.
3. Lies dir die anderen Einstellungen durch, wenn du magst, aber die
   Voreinstellungen sind das empfohlene Setup für neue Nutzer:innen.
4. Scroll runter zu `Definiere einen neuen Flow`.
5. Triff eine Auswahl und definiere deinen Flow entweder aus Lesezeichen oder
   aus einem Ordner und den Tags und/oder Eigenschaften deiner Notizen.
6. Sieh dir eine Vorschau deiner Schöpfung an und ändere oder speichere sie.
7. Schließe das Einstellungsfenster und öffne das Switcher-Modal.
8. Click auf einen der Pfeil-Buttons, um deinen Flow zu öffnen.
9. Bewundere die Aussicht.
10. Klick herum und beobachte, wie das Navigations-Dropdown deine Bewegungen
    verfolgt. Tippe etwas. Klicke den Sync-Button.
11. Öffne die Quellnotiz und prüfe, ob deine Änderung wirklich gespeichert
    wurde.
12. Starre voll Bewunderung (optional).

#### Wie gehen Eigenschaften

- Öffne Obsidians Einstellungen > Obsidian-Plugins und aktiviere
  'Eigenschaften-Ansicht'.
- Öffne eine Notiz deiner Wahl.
- Tippe `cmd + p` für die Befehlspalette und such nach `Eigenschaften`.
- Du siehst den Befehl `Eigenschaften-Ansicht: Zeige Dateieigenschaften` (und
  `Eigenschaften-Ansicht: Alle Eigenschaften anzeigen`)
- Den ersten wählst du aus, um die Eigenschaften der Notiz im aktiven Leafs in
  der rechten Seitenleiste anzeigen zu lassen (den zweiten, um alle
  Eigenschaften aller Notizen in deinem Vault zu sehen).
- Klick auf `Eigenschaft hinzufügen`.
- Es gibt einige Standardeigenschaften - `tags`, `cssclasses`, und `aliases` -
  die du auswählen kannst. Du kannst aber auch einfach in das Eingabefeld über
  dem kleinen Modal klicken und einen frei gewählten Namen für deine Eigenschaft
  angeben.
- Klick dann auf das Icon mit den drei Strichen. Jetzt kannst du einen Typ für
  deine Eigenschaften aussuchen. Was genau die bedeuten, kannst du selber
  recherchieren, aber die Namen sind recht selbsterklärend.
- Du kannst auch in den Einstellungen unter
  `Einstellungen > Editor > Eigenschaften im Dokument` auswählen, ob du
  Eigenschaften immer oben in deinen Notizen angezeigt bekommen möchtest.
- Ich empfehle außerdem wärmstens das Plugin
  ['Multi Properties' von technohiker](https://github.com/technohiker/obsidian-multi-properties).
  Damit kannst du die Eigenschaften von mehreren Notizen gleichzeitig
  bearbeiten.

#### Wie geht Fuzzy-Navigation?

- Beginne deinen Suchbegriff mit einem der Präfixe, falls du deine Suche
  eingrenzen willst:
  - `?`für Regionen im aktiven Flow, `
  - `*` für Regionen in anderen Flows,
  - `:` für Flow-Namen.
- Ergebnisse für den Flow im aktiven Leaf addressieren immer das aktive Leaf.
- Ergebnisse für andere Flows adressieren das zuletzt aktive Leaf des Flows.
  Gibt es das nicht, öffnen sie sich in einem neuen Leaf.
- Ergebnisse für Flow-Namen öffnen sich immer in einem neuen Leaf.

<hr>

### 9. Probleme beheben

Hast du schon versucht, es aus- und wieder anzuschalten?

- **Schließe den problematischen Flow und öffne ihn erneut**
- **baue den problematischen Flow neu**
- **lade deinen Vault neu**

Falls das nicht hilft und du dein Problem auch nicht in der folgenden Liste
findest, [sag bescheid](#12-melde-einen-bug--zeig-deine-liebe).

**Inhaltsverzeichnis**

1. [Flow Erzeugung](#flow-erzeugung)
2. [Flow-Switcher](#flow-switcher)
3. [Fuzzy Navigation-Modal](#fuzzy-navigation-modal)
4. [Menüleiste](#menüleiste)
5. [Flow / Leaf](#flow--leaf)
6. [Komische Probleme](#komische-probleme)
7. [Mehr Probleme](#mehr-probleme)

#### Flow-Erzeugung

- **Problem:** Ich habe einen Flow definiert, aber manche Ordner oder Dateien
  werden einfach ignoriert.
  - **Erklärung:** Die Namen der Ordner oder Dateien enthalten u.U. unzulässige
    Zeichen, die Dataview nicht akzeptiert.
  - **Lösung:**
    - Ersetze die unzulässigen Zeichen durch zulässige.
    - Vergiss nicht, den Ordnernamen auch in der Definition zu ändern.

- **Problem:** Ich versuche, einen Flow aus einer bestimmten Eigenschaft zu
  definieren, aber sie wird ignoriert.
  - **Erklärung:** Der Typ der Eigenschaft ist eine Liste und Datview mag nicht,
    wie sie aussieht.
  - **Lösung:** Einfachste Lösung:
    1. Mach ne Base (Obsidian Bases),
    2. Wähle die Property, die du bearbeiten willst, als Spalte (klick auf
       Eigenschaft und wähl sie aus)
    3. Rechts-klick auf den Eigenschaftennamen im Titel der Spalte und setz den
       Typ auf Text
    4. nochmal Rechts-klick und setz den Typ zurück auf Liste.
    5. Wenn das nicht funktioniert, versuch mal, einzeln durch die betroffenen
       Notizen zu gehen und die Typen hin und her zu switchen.

- **Problem:** Ich habe einen Ordner gebookmarkt, aber wenn ich einen Flow
  daraus bauen will, behauptet textFlow, es wären keine Notizen darin.
  - **Lösung:** Du musst die Notizen in dem Ordner bookmarken. Vorher kannst du
    noch eine neue Lesezeichen-Gruppe mit dem Namen des Ordners anlegen, den du
    ursprünglich bookmarken wolltest.
  - **TIP:** Wenn du eine Notiz noch in einer zweiten Sammlung haben willst,
    musst du sie öffnen und dann in der Lesezeichenansicht auf 'Lesezeichen für
    den aktiven Tab anlegen' klicken.

- **Problem:** Die Notizen in deiner Preview sind in einer ganz anderen
  Reihenfolge als die Notizen in deinem Datei-Explorer, obwohl du 'Notizen' als
  Sortierreihenfolge ausgewählt hast.
  - **Erklärung:** textFlow folgt der Reihenfolge des Dateibaums auf Systemebene
    (mit JavaScript Geschmack), nicht der auf UI-Ebene.
  - **Lösung:**
    - Benutzt du ein Plugin, um deine Notizen im Datei-Explorer manuell zu
      sortieren?
      - Du musst deine Notizen entweder numerieren, um die Reihenfolge zu
        erzeugen, die du willst, oder die Reihenfolge in einer
        **Lesezeichen-Gruppe** spiegeln und deinen Flow von dort definieren
        (dann kannst du allerdings die Auswahl nicht per Eigenschaften
        verfeinern).
    - Hast du deine Notizen 'basisname', 'basisname1', 'basisname2'... benannt?
      - JavaScript folgt seinem eigenen Alphabet, bei dem 'basisname' _nach_
        'basisname1' kommt. Außerdem kommt 'basisname10' gleich nach
        'basisname1'
      - Die Lösung ist, 'basisname' in 'basisname00' umzubenennen, 'basisname1'
        in 'basisname01' usw.

#### Flow-Switcher

- **Problem:** Ein Flow will sich nicht öffnen, obwohl er im Switcher angezeigt
  wird.
  - **Lösung:**
    - Versuche, den Flow neu zu bauen und deinen Vault neu zu laden. Falls der
      Button dafür ausgegraut ist, löse den Neubau über den Einstellungstab aus.
    - Starte Obsidian neu.
    - Wenn all das nicht hilft, lösche die Definition des Flows und schreibe sie
      neu.

- **Problem:** Das Modal ist leer, obwohl du mehrere Flows definiert hast.
  - **Lösung:**
    - Prüfe nach, ob deine Definitionen tatsächlich noch existieren. Dein
      Sync-Service kann textFlows `data.json` beschädigt oder gelöscht haben.
    - Falls die Definitionen verschwunden sind, musst du sie - und das Plugin -
      neu einrichten.

#### Fuzzy Navigation-Modal

- **Problem:** Wenn ich meine Suche mit einem Fragezeichen anfange, werden keine
  Ergebnisse angezeigt.
  - **Erklärung:** Das aktive Leaf enthält keinen Flow, entsprechend kann die
    Such für das aktive Leaf auch keine Ergebnisse bringen.
  - **Lösung:** Klicke in das Leaf mit dem Flow, den du durchsuchen möchtest,
    oder beginne deine Suche mit dem Namen des Flows.

#### Menüleiste

- **Problem:** Die Menüleiste wird für einen deiner Flows nur halb gerendert
  (optional: und der Sync-Button bleibt aktiviert)
  - **Lösung:**
    - Schließe den Flow und baue ihn neu. Wenn der Button dafür ausgegraut ist,
      mach den Neubau über die Einstellungen.

- **Problem:** textFlows Menüleiste verdeckt die Editing Toolbar von
  Cuman/verdeckt die Sucheingabe/wird von der Sucheingabe verdeckt.
  - **Erklärung:**
    - Es ist einfach schwierig bis unmöglich, Elemente, die sehr nahe bei
      einander angebracht sind, zur friedlichen Koexistenz zu bewegen.
  - **Lösung:**
    - min/max die Menüleiste.
    - Falls sie nicht sichtbar ist, benutze den Befehl: `strg/cmd + p` und dann
      'Menüleiste' eingeben. Du kannst den Befehl auch mit einer
      Tastenkombination verknüpfen (in Obsidians Einstellungen).

- **Problem:** Die textFlow Menüleiste wird immer von einer anderen Menüleiste
  verdeckt
  - **Lösung:**
    - Lass dir die anderen Menüleisten an einer anderen Position anzeigen oder
      blende sie aus.

- **Problem**: Ich habe aus Obsidian raus geklickt, während das
  Navigations-Dropdown ausgeklappt war, und jetzt schließt es sich nicht mehr,
  wenn ich außerhalb davon klicke.
  - **Solution:** Ja... keine Ahnung, warum es das tut. Klick einen Menüeintrag,
    das bringt es wieder zur Besinnung.

#### Flow / Leaf

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
    - Du hast einen ungeschlossenen Code-Block irgendwo.
      - Vielleicht ist es unabsichtlicher Code, wie `<blah`, dann musst du nur
        ein Leerzeichen zwischen die spitze Klammer und die Buchstaben setzen: <
        blah.
      - Aber wenn es ein ganzer html-artiger Tag ist, musst du ihn in Backticks
        (accent gràve) einschließen. Entweder einzelne, wenn du nur ein
        einzelnes Wort/Zeile isolieren willst - so: `<boolean>`, `<b>` - oder
        drei - ` ``` `- in der Zeile über und der Zeile unter dem Textblock,
        damit Obsidian versteht, dass es nichts interpretieren soll, was in
        diesem Block steht.
      - Je nach Ursache funktionieren die drei Backticks allerdings nicht.

- **Problem:** Du versuchst, den gesamten Flow mit `ctrl+a` zu markieren, aber
  das funktioniert nicht.
  - **Lösung:**
    - Probiers noch mal. Beim zweiten Mal klappt es.
    - Aber da du wahrscheinlich keine unsichtbaren UUIDs in deinem kopierten
      Flow haben willst, exportiere ihn stattdessen (es gibt einen Knopf in der
      Menüleiste und auch einen Befehl). Das entfernt die UUIDs für dich und du
      kannst die neue Notiz ohne Einschränkungen handhaben.

#### Komische Probleme

- **Problem**: Die Suchleiste wird nicht angezeigt.
  - **Lösung:**
    - Manchmal kommen sich Suche und Menüleiste in die Quere, und Menüleiste
      verdeckt die Sucheingabe.
    - Minimiere die Menüleiste, dann taucht die Sucheingabe wieder auf.

- **Problem:** textFlow will, dass du einen Flow syncst, aber wenn du den Button
  klickst, passiert nichts, und du kannst den Flow nicht neubauen, weil es
  ungesyncte Änderungen gibt.
  - **Lösung:**
    - Hast du gerade einen Sync-Fehler repariert?
    - Öffne textFlows Einstellungen. Hier kannst du Flows immer neu bauen,
      unabhängig vom Sync-Status. Das sollte das Problem beheben.

- **Problem:** Mit jedem Neubau werden die Titel deiner Notizen zu ihrem Inhalt
  hinzugefügt.
  - **Lösung:**
    - Das ist entweder ein Problem mit deinem Setup oder ein Bug in einer (oder
      mehreren) von Obsidians Versionen.^ Mach ein Update deiner App auf Version
      1.8.10, um zu garantieren, dass das Problem nicht von Obsidian selbst
      ausgelöst wird.
    - Falls der Fehler weiterhin auftritt, schalte all deine Plugins aus und
      dann nach einander wieder ein, während du Neubauten machst, um
      rauszufinden, wer das Problem verursacht
      ([und lass es mich wissen](#12-melde-einen-bug--zeig-deine-liebe))

- **Problem:** Navigation per Datei-Explorer funktioniert nicht, obwohl es
  definitiv angeschaltet ist.
  - **Lösung:**
    - Prüfe nach, ob deine Flow-Definitionen noch da sind.

#### Mehr Probleme

- **Problem:** Du hast einen Flow geöffnet und jetzt ist Obsidian super langsam.
  - **Lösung:** Obsidian hat ein implizites Größenlimit für Notizen und kann 2MB
    oder mehr nicht gleichzeitig handhaben.
  - Schließe deinen großen Flow, lade Obsidian neu, um seinen Arbeitsspeicher zu
    leeren, dann teile deinen Riesenflow in mehrere kleine auf.

- **Problem:** Irgend etwas anderes funktioniert nicht und Neubau/neu laden
  hilft nicht.
  - **Lösung:**
    [Schick mir einen Bug-Report](#12-melde-einen-bug--zeig-deine-liebe)

<hr>

### 10. Spickzettel

**Lingo und Konzepte, die textFlow benutzt**

- **Die Grundidee:** textFlow kopiert den Inhalt bestimmter (Quell-)Notizen in
  eine neue Notiz (einen Flow) und synchronisiert Änderungen dieser neuen Notiz
  mit den Quellnotizen. Und das wars auch schon. Das ist das Plugin. Braucht
  anscheinend trotzdem ein 6.000+ Worte Readme...
- **Eigenschaften:** Oder YAML oder Properties. Metadaten, die du Notizen in
  Obsidian zufügen kannst. Du kannst Eigenschaften benutzen, um sehr spezifische
  Flows zu erstellen. Die Eigenschaften deiner Quellnotizen werden _nicht_ in
  den Flow eingebaut, aber du kannst einem Flow als Ganzes Eigenschaften geben,
  wenn du möchtest.
- **Unsichtbare UUID:** Ein langer String aus verschiedenen, nicht-druckbaren
  und hauptsächlich null-breiten Zeichen, der benutzt wird, um die base16 UUID
  zu repräsentieren, die für jede Quellnotiz erzeugt wird, wenn sie einem Flow
  hinzugefügt wird. Siehe außerdem: Region.
- **Leaf:** Leaf ist im Grunde Obsidians Bezeichnung für einen Tab.
- **Überlappung:** Eine Überlappung entsteht, wenn zwei oder mehr Flows die
  gleichen Quellnotizen beinhalten. Wenn du mehrer überlappende Flows geöffnet
  hast und in der überlappenden Region Text änderst, kann das zu ständigen
  Neubauten und Problemen mit dem Tracking führen.
- **Neubau:** Der Prozess, bei dem der Inhalt von Quellnotizen in einen Flow
  kopiert wird. Dieser Prozess prüft Quellnotizen auf UUIDs, generiert eine neue
  UUID für jede Notiz und schreibt einen neuen Flow. Daher kann das Ganze für
  lange Flows bis zu mehrere Sekunden dauern.
- **Region:** Der Inhalt einer einzelnen Quellnotiz in einem Flow. Regionen
  werden durch unsichtbare UUIDs und graue Linien von einander getrennt, damit
  textFlow deine Bearbeitungen der korrekten Notiz zuordnen und dorthin zurück
  syncen kann.
- **Tracken:** textFlow bringt drei Compartments mit Erweiterungen darin an
  jedem Leaf an, das einen Flow enthält:
  1.  Einen Cursor-Listener, damit textFlow weiß, wo im Flow du dich befindest.
      Dieser Listener ruft eine Funktion, die nach UUIDs sucht, um zu sehen, in
      welcher Region du dich befindest.
  2.  Einen Update-Listener für das Dokument im Editor, damit textFlow merkt,
      wenn du an einer Region eine Änderung vornimmt. Dieser Listener ruft eine
      Funktion, die in `/.obsidian/plugins/textFlow/data.json` speichert, welche
      Region geändert wurde.
  3.  Einen Transaktionsfilter, der kontinuierlich die 60 Zeichen vor und hinter
      dem Cursor mit einer regEx prüft, um zu sehen, ob sich der Cursor in einer
      UUID befindet. Gibt der Check 'true' zurück, werden alle Transaktionen
      blockiert, so dass die UUID geschützt ist. **Dieses Tracking sendet
      _keine_ Daten an irgendwelche Server!** textFlow weiß nicht mal, dass das
      Internet existiert.

<hr>

### 11. textFlow und Gliederung im Vergleich

Obsidian hat schon einen Weg, um einzelne, große Dokumente zu browsen, und zwar
in Form des Kern-Plugins 'Gliederung' - also wann ist textFlow einen Blick wert?
Und wann solltest du beide zusammen benutzen?

**Die Vorteile von textFlow, aka die Gründe, warum ich dieses Plugin geschrieben
habe (aufsteigende Reihenfolge):**

- **Automation und Flexibilität:**
  - Mit textFlow kannst du an einem Dutzend verschieden zusammengesetzter
    Auszüge deines Vaults arbeiten, ohne jemals etwas von Hand hin und her
    kopieren zu müssen, Teile zu vergessen, Updates zu vergessen, und verwirrt
    darüber zu sein, welche Zusammenstellung welche Version enthält, weil
    textFlow das alles für dich regelt.
- **Schnappschüsse:**
  - Wenn du einen Schnappschuss eines bestimmten Abschnittes machen willst,
    musst du in Outline per copy/past vorgehen, eine neue Notiz erstellen und
    sie von Hand betiteln.
  - Mit textFlow existieren all deine Quellnotizen noch und du kannst gezielt
    Schnappschüsse von jeder machen (versuch mal
    ['Backitup' von hammadXP](https://github.com/hammadxp/back-it-up) -
    funktioniert am besten zusammen mit
    ['File diff' von Till Friebe](https://github.com/friebetill/obsidian-file-diff))
- **Datei-Explorer:**
  - Das Plugin
    ['Quiet outline' von guopenghui](https://github.com/guopenghui/obsidian-quiet-outline)
    wendet html auf Überschriften im Outline an, so dass du sie bunt markieren
    kannst, und auto-expand klappt die Überschriften aus, unter denen du gerade
    arbeitest. Aber das Markieren im Datei-Explorer ist bequemer
    ([Color folders and files](https://github.com/Mithadon/obsidian-color-folders-files),
    [Explorer color](https://github.com/VaguelyElectric/obsidian-explorer-colors),
    [Note status](https://github.com/devonthesofa/obsidian-note-status)), und
    Datei-Explorer merkt sich über Neustarts hinweg, welche Ordner ausgeklappt
    waren und welche nicht, während du in Outline deine Arbeitsumgebung nach
    jedem Neustart neu einrichten musst.

**Die Vorteile von Outline aka warum du meine Gründe vielleicht nicht
nachvollziehen kannst:**

- Keine Daten-Duplikation wie sie für textFlow nötig ist.
- Du kannst deine Notiz in jedem beliebigen Editor öffnen und bearbeiten.
- Du kannst die Reihenfolge von Abschnitten per Drag-and-Drop ändern, während du
  in textFlow Quellnotizen umbenennen musst, um ihre Reihenfolge zu ändern.
- Durch Überschriften zu navigieren, ist deutlich robuster als textFlows
  Navigation mit dem Datei-Explorer.
- Du musst niemals darauf warten, dass ein Neubau fertig wird.

**Zusammen sind sie großartig:**

- Aber warum auswählen, wenn du die größten Stärken beider Plugins nutzen
  kannst - textFlow, um flexible Dokumente zu erzeugen, und die
  Gliederungsansicht, um sie granular zu navigieren?

<hr>

### 12. Melde einen Bug / Zeig deine Liebe

Falls dir irgendwelche Bugs oder komisches Verhalten begegnen, die in diesem
Readme nicht erwähnt werden, melde dich auf github:
https://github.com/tine-schreibt/textFlow/issues Du kannst mir auch per email
bescheid sagen: tine at tine-schreibt dot de.

Falls du dieses Plugin einfach nur liebst und ein bisschen Knete übrig hast,
kannst du mir auf Ko-fi ein Trinkgeld geben: https://ko-fi.com/tine_schreibt
