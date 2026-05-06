# Fragenliste fuer das Gespraech mit dem Steuerberater zur Tax Engine

## Ziel

Diese Liste soll helfen, die aktuelle Steuerlogik von MyImmoHub gemeinsam mit einem Steuerberater zu ueberpruefen und gezielt Verbesserungen abzuleiten.

Die Fragen sind so formuliert, dass man sie direkt im Gespraech durchgehen kann.

---

## A. Grundlogik der Anlage V

1. Welche Kostenarten sollten in der Praxis in die folgenden Bloecke fallen?
   - umlagefaehige laufende Kosten
   - nicht umlegbare Objektkosten
   - sonstige Werbungskosten
   - Finanzierungskosten
   - Erhaltungsaufwand

2. Gibt es Kostenarten, die haeufig falsch eingeordnet werden, wenn man nur mit Buchungstexten und Kategorien arbeitet?

3. Welche Mindestinformationen braucht man aus fachlicher Sicht, um einen Kostenposten sicher steuerlich zuzuordnen?

4. Gibt es Kostenarten, die man niemals automatisch mappen sollte, sondern immer manuell bestaetigen lassen sollte?

---

## B. Vermietungsanteil und Eigennutzung

5. Welche Werbungskosten duerfen mit dem Vermietungsanteil gequotelt werden?

6. Fuer welche Felder ist eine pauschale Quotelung problematisch oder fachlich falsch?

7. Sollte der Vermietungsanteil immer tagebasiert berechnet werden, oder gibt es Fallgruppen, in denen eine andere Herleitung sinnvoller ist?

8. Wie sollten Sonderfaelle behandelt werden:
   - Leerstand
   - teilmoeblierte Vermietung
   - zeitweise Selbstnutzung
   - zeitweise unentgeltliche Ueberlassung

---

## C. AfA

9. Was sollte fachlich der fuehrende AfA-Wert sein, wenn mehrere Quellen vorhanden sind?
   - Objektstammdaten
   - expliziter Jahreswert
   - aus PDF importierter ELSTER-Wert
   - strukturierte AfA-Komponenten

10. Wie sollte mit Rundungsdifferenzen zwischen berechneter AfA und importierter Steuererklaerung umgegangen werden?

11. Sollte die Engine eher komponentenbasiert rechnen oder eher einen explizit gepflegten Jahreswert priorisieren?

12. Welche typischen AfA-Bestandteile sollten fachlich getrennt behandelt werden?
   - Gebaeude
   - Aussenanlagen
   - Einbaukueche / Inventar / Ausstattung

13. Welche Regeln braucht es, wenn nachtraegliche Investitionen die AfA veraendern?

---

## D. Erhaltungsaufwand und Verteilungslogik

14. Nach welchen fachlichen Kriterien sollte die Engine unterscheiden zwischen:
   - sofort abzugsfaehigem Erhaltungsaufwand
   - verteiltem Erhaltungsaufwand
   - Herstellungskosten

15. Welche Arten von Massnahmen werden in der Praxis am haeufigsten falsch als Erhaltungsaufwand oder Herstellungskosten eingeordnet?

16. Wie sollte die Engine die 15%-Regel fuer anschaffungsnahe Herstellungskosten am besten abbilden?

17. Reicht eine jaehrliche Pruefung, oder braucht es dafuer eine strengere Betrachtung ueber den Dreijahreszeitraum?

18. Welche Nachweise oder Zusatzdaten sollten fuer solche Faelle im System dokumentiert werden?

19. Wenn eine Ausgabe einem Verteilungsplan zugeordnet ist:
   - darf sie dann in keinem Fall mehr als sofort abzugsfaehiger Erhaltungsaufwand erscheinen?
   - gibt es Ausnahmen?

20. Wie sollten Vorjahres-Verteilungsbloeke steuerlich sauber fortgefuehrt werden?

---

## E. PDF-Import / Uebernahme aus Steuererklaerungen

21. Welche Werte aus einer offiziellen ELSTER-/Steuer-PDF sollten im Zweifel als fuehrende Referenz gelten?

22. Bei welchen Feldern waere es steuerlich akzeptabel, importierte Werte nur als Vorschlag zu behandeln?

23. Welche Felder sollten niemals blind aus einer PDF uebernommen werden, sondern immer gegen Belege oder Stammdaten geprueft werden?

24. Ist es fachlich sinnvoll, importierte Vorjahres-Verteilungsbloeke und AfA-Werte als strukturierten Bestand weiterzufuehren?

---

## F. GbR / FE-FB

25. Welche Logik sollte fuer die Verteilung eines kollektiven Ergebnisses auf Beteiligte gelten?

26. Wie sollten Sonderwerbungskosten je Beteiligtem am besten modelliert werden?

27. Gibt es typische Fehlerquellen bei:
   - Partnerquoten
   - Sonder-WK
   - Nachtraegen oder abweichenden Vereinbarungen

28. Welche Mindestdaten braucht die Engine fuer eine fachlich belastbare FE-/FB-Herleitung?

---

## G. Produktiver Einsatz / Risikosteuerung

29. Welche Teile der Logik koennen aus fachlicher Sicht automatisiert werden?

30. Welche Teile sollten zwingend in einer manuellen Freigabeschleife bleiben?

31. Wo waere ein Ampelsystem sinnvoll:
   - gruen = fachlich stabil
   - gelb = Vorschlag / bitte pruefen
   - rot = manuelle Entscheidung erforderlich

32. Welche Referenzfaelle sollten wir gemeinsam definieren, damit die Engine spaeter belastbar getestet werden kann?

33. Welche Dokumentation erwartet ein Steuerberater oder Betriebspruefer spaeter, um die Herleitung nachvollziehen zu koennen?

---

## H. Konkrete Abschlussfragen

34. Welche 3 bis 5 fachlichen Regeln sollten wir als Erstes verbindlich festschreiben?

35. Welche Stellen in der aktuellen Engine sind aus deiner Sicht fuer produktiven Einsatz noch zu riskant?

36. Welche Vereinfachungen sind akzeptabel und welche waeren steuerlich zu gefaehrlich?

37. Wenn wir nur einen kleinen ersten produktiven Scope definieren:
   - fuer welche Objektarten
   - fuer welche Konstellationen
   - und mit welchen Ausschluessen
   waere die Engine aus deiner Sicht verantwortbar einsetzbar?

---

## Empfohlene Besprechungsunterlagen

Fuer das Gespraech sollten idealerweise vorliegen:

- dieses Fragenpapier
- das ausfuehrliche Tax-Engine-Briefing
- eine echte ELSTER-Abgabe
- der dazugehoerige MyImmoHub-Export
- optional eine Reconciliation je Kostenblock

So kann die Diskussion von abstrakten Fragen schnell in konkrete Verbesserungen uebergehen.
