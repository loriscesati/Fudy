# Roadmap v2.0+ (Fase 3 & Evoluzioni Future) — FODMAP Path (Fudy)

> **Obiettivo delle Versioni Successive (v2.0+):** Potenziare la capacità analitica della PWA locale, dotandola di strumenti di reportistica esportabile per il professionista sanitario e di un motore di analisi delle associazioni probabilistiche tra alimenti e sintomi, il tutto interamente client-side senza alcun server esterno.

---

## 📋 Epic & Task Futuri

### 1. Reportistica per il Professionista (CSV / PDF)

Generazione interamente client-side (nessun dato lascia il dispositivo) di report esportabili per il dietista o il gastroenterologo.

- [x] **1.1 Esportazione CSV Multi-Traccia**
  - File CSV separati per: **Pasti** (con grammature e ingredienti), **Sintomi** (orari + intensità), **Registro Alvo Bristol**, **Log Challenge** (esiti e dosi).
  - Formato aperto, leggibile in qualsiasi foglio di calcolo (Excel, LibreOffice, Google Sheets).
  - Generazione tramite `Blob` + `URL.createObjectURL` — zero dipendenze server.

- [x] **1.2 Report PDF Sintetico per Dietista / Medico**
  - Layout stampabile di 2-3 pagine con:
    - Dati generali del percorso (giorni di dieta, fase attuale, obiettivo dichiarato).
    - Andamento sintomi (dolore e gonfiore) rispetto al baseline iniziale.
    - Mappa sinottica delle tolleranze verificate per ciascun gruppo FODMAP.
    - Distribuzione tipi Bristol nel periodo selezionato.
    - Correlazioni con ciclo mestruale ed endometriosi (se modulo attivo).
  - Filtro periodo: ultimi **14**, **30** o **60** giorni.
  - Opzione per oscurare note testuali personali sensibili prima della stampa/condivisione.
  - Generazione client-side (layout print-optimized con zero server).

---

### 2. Analisi Avanzata delle Associazioni Probabilistiche

> **Nota sulla gestione degli ingredienti:** L'app non dispone di un database automatico di ingredienti né di scanner barcode. L'analisi si basa interamente sugli **ingredienti singoli** inseriti manualmente dall'utente nella composizione dei pasti. Per pasti composti o consumati fuori casa, l'utente è incoraggiato a scomporre il piatto nei suoi componenti principali (es. "Pasta al pesto" → pasta, basilico, pinoli, parmigiano, olio). Dove ciò non è possibile, il flag "Mangiato fuori casa / Porzione stimata" riduce il peso statistico dell'osservazione.

- [x] **2.1 Algoritmo di Pattern Recognition con Incertezza Dichiarata**
  - Analisi delle correlazioni in finestre temporali configurabili (default: **4 ore** per sintomi gastrici, **6-12 ore** per fermentazione colica).
  - Riconoscimento di correlazioni multifattoriali complesse (es. *grasso elevato + fruttani* vs *fruttani isolati*).
  - Calcolo della **frequenza di co-occorrenza** tra ciascun alimento/ingrediente e i sintomi successivi.
  - **Intervallo di confidenza** per ciascuna associazione, esplicitando sempre la presenza di fattori confondenti.
  - **Divieto assoluto di claim "AI-diagnostic":** l'app presenta esclusivamente osservazioni statistiche con livello di evidenza dichiarato.

- [x] **2.2 Livelli di Evidenza per le Associazioni**
  - `OSSERVAZIONE_ISOLATA`: 1 episodio di co-occorrenza.
  - `POSSIBILE_ASSOCIAZIONE`: 2-3 episodi, dati parziali.
  - `ASSOCIAZIONE_RIPETUTA`: ≥ 4 episodi con medesima risposta senza macro-confondenti.
  - `CONFONDIMENTO_PROBABILE`: Presenza di ciclo mestruale, stress acuto, alcol, farmaci o insonnia nella stessa finestra.
  - `CHALLENGE_STRUTTURATO`: Risultato validato da protocollo controllato a 3 dosi.
  - `SOGLIA_VERIFICATA`: Dose massima confermata in più occasioni.
  - `DA_RITESTARE`: Risultato anteriore a 6 mesi o con esiti contraddittori.

- [x] **2.3 Visualizzazione dei Pattern**
  - Dashboard con i "sospetti principali" ordinati per frequenza e livello di evidenza.
  - Possibilità di espandere ciascun sospetto per visualizzare i pasti e i sintomi che lo compongono.
  - Filtro per gruppo FODMAP e per periodo.

---

## 🎯 Criteri di Accettazione v2.0+

1. Il CSV generato si apre correttamente in Excel e LibreOffice senza errori di encoding (UTF-8 BOM).
2. Il PDF contiene tutte le sezioni previste ed è leggibile su qualsiasi visualizzatore standard.
3. L'algoritmo di associazione non produce mai affermazioni diagnostiche; ogni pattern è accompagnato dal livello di evidenza.
4. L'analisi esclude automaticamente le osservazioni con confondenti forti (ciclo, stress 3/3, farmaci) dal calcolo delle associazioni, flaggandole come "dato incerto".
5. Tutto funziona al 100% offline — nessuna chiamata di rete.
