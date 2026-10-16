# Roadmap v1.0 (Fase 2) — FODMAP Path (Fudy)

> **Obiettivo della Versione 1.0:** Trasformare l'MVP in una soluzione clinica completa, introducendo analisi degli andamenti, confronto rigoroso con il baseline, gestione del periodo di washout, pianificazione dei retest, reportistica professionale esportabile in PDF e controlli attivi di sicurezza clinica (Red Flags e monitoraggio dell'iper-restrizione alimentare).

---

## 📋 Epic & Task Dettagliati

### 1. Dashboard Settimanale & Analitica Non Diagnostica
- [ ] **1.1 Andamento Dolore e Gonfiore**
  - Grafico settimanale con medie mobili di dolore addominale e gonfiore.
  - Evidenziazione delle giornate stabili (verdi), intermedie (gialle) o sopra-soglia (arancioni/rosse).
- [ ] **1.2 Confronto Baseline vs Fase Corrente**
  - Vista comparativa affiancata: intensità sintomi pre-dieta vs fase di eliminazione o reintroduzione.
  - Calcolo della variazione percentuale dei giorni asintomatici.
- [ ] **1.3 Tabella delle Tolleranze per Gruppo FODMAP**
  - Matrice riassuntiva dei 6 gruppi FODMAP: Fruttani (grano/verdure), GOS, Lattosio, Fruttosio, Sorbitolo, Mannitolo.
  - Visualizzazione visiva: *Completato / Tollerato*, *Dose-Limitato*, *Non Tollerato*, *Da Testare*, *Retest in Scadenza*.

### 2. Gestione Avanzata dei Challenge & Retest
- [ ] **2.1 Protocollo di Washout Guidato**
  - Periodo obbligatorio di "lavaggio" (minimo 3–5 giorni di dieta rigorosamente low-FODMAP asintomatica) tra un challenge e il successivo.
  - Blocco dell'avvio di un nuovo challenge se il baseline non è tornato stabile.
- [ ] **2.2 Calendario Retest Programmato**
  - Sistema di scadenze a 3 e 6 mesi per alimenti classificati come "Dose-limitati" o "Non tollerati".
  - Notifica interna/badge nella tab *Percorso*: "Hai 2 alimenti pronti per essere rivalutati".
  - Conservazione dello storico di tutti i challenge eseguiti sullo stesso alimento senza sovrascriverne il pregresso.

### 3. Modulo Fattori Confondenti (Tracking Giornaliero)
- [ ] **3.1 Check-in Rapido dei Confondenti**
  - Registrazione 1-tap di:
    - Livello di stress percepito (`Basso`, `Medio`, `Alto`)
    - Qualità del sonno (`Riposato`, `Disturbato`, `Insonne`)
    - Attività fisica insolita
    - Pasto molto abbondante o insolitamente ricco di grassi
    - Consumo di alcol o eccesso di caffè
    - Assunzione di farmaci (FANS, antibiotici, lassativi)
    - Episodi di malattia intercorrente
- [ ] **3.2 Integrazione nell'Analisi delle Finestre Temporali (4h)**
  - Correlazione visiva: i sintomi comparsi dopo un pasto vengono evidenziati con l'icona del confondente (es. ⚠️ *stress elevato registrato nella stessa finestra*).

### 4. Reportistica Specialistica (PDF & CSV)
- [ ] **4.1 Esportazione CSV Multi-Traccia**
  - File CSV formattati per: Pasti con grammature, Sintomi orari, Registro Alvo Bristol, Log Challenge.
- [ ] **4.2 Generatore Client-Side di Report PDF per il Dietista/Gastroenterologo**
  - Layout pulito ed elegante stampabile:
    - Dati generali del percorso (giorni di dieta, fase attuale, obiettivo)
    - Grafico andamento sintomi rispetto al baseline
    - Mappa sinottica delle tolleranze verificate per ciascun gruppo FODMAP
    - Sintesi evacuazioni (distribuzione tipi Bristol)
    - Correlazioni con ciclo mestruale ed endometriosi (se modulo attivo)
  - Filtro periodo (ultimi 14, 30 o 60 giorni).
  - Opzione per oscurare note testuali personali sensibili nel PDF prima della stampa/condivisione.

### 5. Controlli di Qualità del Dato
- [ ] **5.1 Rilevamento di Anomalie e Incertezze**
  - Warning discreto per pasti inseriti oltre 6 ore dopo il consumo ("Dato inserito in differita").
  - Richiesta di conferma quando manca la porzione numerica (es. "porzione libera").
  - Identificazione di schede alimento duplicate con possibilità di unione (*merge*).
  - Validazione rigorosa delle unità di misura.

### 6. Sicurezza Clinica & Prevenzione Iper-Restrizione
- [ ] **6.1 Sorveglianza "Red Flags" (Segnali di Allarme Clinici)**
  - Riconoscimento passivo di: perdita di peso non intenzionale, rettorragia, vomito ricorrente, febbre o risvegli notturni da dolore.
  - Alert etico non allarmistico che raccomanda una visita medica gastroenterologica.
- [ ] **6.2 Questionario Settimanale Anti-Ortoressia**
  - Verifica automatica: quante categorie sono escluse da più di 6 settimane consecutive?
  - Breve questionario di 4 domande: paura del cibo, pasti saltati volontariamente, ansia sociale nel mangiare fuori.
  - Raccomandazione attiva di sospendere ulteriori restrizioni e chiedere consulto specialistico se lo score è critico.

### 7. Esperienza Utente & Accessibilità
- [ ] **7.1 Modello Pasti Preferiti & Ricette**
  - Salvataggio di pasti ricorrenti come template (es. "Pranzo tipo ufficio").
- [ ] **7.2 Accessibilità & Contrasto Visivo**
  - Pieno supporto contrasto WCAG AA.
  - Palette semaforica ottimizzata per daltonismo (modalità color-blind con simboli geometrici affiancati ai colori).
- [ ] **7.3 Notifiche Locali Programmabili (Web Notifications API)**
  - Promemoria orari locali facoltativi per il check-in serale o post-prandiale (senza server esterni).

### 8. Testing Automatizzato & Validazione Formale
- [ ] **8.1 Test Unitari della Macchina a Stati**
  - Copertura 100% delle transizioni del Challenge a 3 dosi (casi normali, interruzioni, washout, risultati dubbi).
- [ ] **8.2 Test di Regressione del Layer di Persistenza**
  - Test di migrazione dello schema IndexedDB e integrità degli snapshot storici dei pasti.

---

## 🎯 Criteri di Accettazione v1.0
1. Il report PDF generato in locale si apre correttamente in qualsiasi visualizzatore PDF e contiene una sintesi chiara di 2-3 pagine priva di layout broken.
2. Un challenge completato aggiorna la scheda dell'alimento e calendarizza la data del retest a 90 giorni.
3. Se l'utente tenta di iniziare un challenge subito dopo un altro senza completare i 3 giorni di washout, l'app spiega chiaramente perché attendere.
4. Gli avvisi di sicurezza (Red Flags e iper-restrizione) si attivano coerentemente senza generare panico ma fornendo opportuna cautela.
