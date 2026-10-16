# Roadmap MVP (Fase 1) — FODMAP Path (Fudy)

> **Obiettivo dell'MVP:** Realizzare una Progressive Web App (PWA) local-first, installabile e completamente offline, che consenta all'utente di abbandonare i semplici elenchi statici per gestire concretamente le prime due fasi della dieta (Riduzione e Reintroduzione guidata a 3 dosi), tenendo traccia dell'alvo (Bristol), del gonfiore/dolore rapido e del modulo base di endometriosi.

---

## 📋 Epic & Task Dettagliati

### 1. Fondamenta Tecniche PWA & Local Storage
- [ ] **1.1 Setup PWA & Service Worker Cache**
  - Configurazione `manifest.json` completo (nome: "FODMAP Path", colori `#059669`, icone mascherabili 192/512px, display standalone).
  - Service Worker con strategia `Cache-First` per asset statici e HTML shell per funzionamento 100% offline.
  - Test installazione su iOS Safari (Add to Home) e Android Chrome.
- [ ] **1.2 Setup Layer IndexedDB (`infrastructure/storage`)**
  - Implementazione wrapper tipizzato (es. `idb`) con gli store: `foods`, `meals`, `symptoms`, `bowel_events`, `challenges`, `cycle_logs`, `user_profile`.
  - Migrazioni di schema versionate.
- [ ] **1.3 Privacy & Diritto all'Oblio**
  - Funzione "Cancella tutti i dati" con dialog di conferma a doppio passaggio.
  - Zero chiamate a server esterni o analytics.

### 2. Onboarding & Profilo Utente
- [ ] **2.1 Wizard di Onboarding**
  - Selezione fase di partenza (Preparazione/Baseline, Riduzione attiva, Reintroduzione, Personalizzazione).
  - Selezione obiettivo di salute (gonfiore, dolore, diarrea, stipsi, regolarità).
  - Eventuale diagnosi nota (IBS, Endometriosi, celiachia, intolleranza al lattosio).
  - Separazione netta tra filtri *Senza Glutine/Senza Lattosio* e gruppi FODMAP.
  - Dichiarazione di trasparenza & disclaimer medico (non diagnostico, non sostituisce il medico).
- [ ] **2.2 Baseline Iniziale**
  - Registrazione livello iniziale medio di dolore (0–10) e gonfiore (0–10).

### 3. Schede Alimenti & Gestione Dose-Dipendente
- [ ] **3.1 CRUD Alimenti Completo**
  - Form di creazione e modifica con: Nome, sinonimi, categoria alimentare, modalità di preparazione (crudo, cotto, scolato, fermentato).
  - Assegnazione gruppo/i FODMAP associato/i (Fruttani, GOS, Lattosio, Fruttosio libero, Sorbitolo, Mannitolo o Basso FODMAP).
  - Campo obbligatorio **Fonte dell'informazione** (Personale, Dietista, Etichetta, Studio scientifico).
- [ ] **3.2 Stato Personale di Tolleranza**
  - Selezione dello stato: `Non provato`, `In osservazione`, `Dose-limitato`, `Tollerato liberamente`, `Non tollerato`.
  - Indicazione della **massima porzione tollerata verificata** (es. 40g).
- [ ] **3.3 Catalogo Generico Base (No violazioni Monash)**
  - Precaricamento di ~30 alimenti generici di base con categorie trasparenti, senza punteggi proprietari protetti.
  - Ricerca istantanea con filtro per nome e categoria.

### 4. Schede Pasti & Snapshot Immutabile
- [ ] **4.1 Composizione Pasti Multi-Ingrediente**
  - Selezione rapida di alimenti con ricerca predittiva e lista preferiti/recenti.
  - Quantità consumata per singolo ingrediente (g, ml, porzione stimata).
  - Orario reale del pasto e tipologia (Colazione, Pranzo, Cena, Spuntini).
  - Flag "Mangiato fuori casa" (avviso visivo di porzione/ingredienti meno certi).
  - Flag "Porzione stimata".
- [ ] **4.2 Immutabilità dello Storico (Snapshot Pattern)**
  - Salvataggio del pasto con snapshot delle caratteristiche degli ingredienti al momento del pasto, per non alterare il passato se una scheda alimento viene modificata.
- [ ] **4.3 Duplicazione Rapida**
  - Tasto "Ripeti ultimo pranzo / ultima cena" con 1 tocco.

### 5. Check-in Sintomi (< 15 Secondi)
- [ ] **5.1 Modalità Check-in Rapido**
  - Slider Gonfiore Addominale (0–10).
  - Slider Dolore Addominale (0–10).
  - Stato intestinale percepito vs baseline (`Migliore`, `Uguale`, `Peggiore`).
  - Tasto rapido *"Nessun Sintomo"* (1 tap registra valori a zero e salva).
- [ ] **5.2 Registrazione oraria**
  - Orario di inserimento per correlazione oraria con i pasti precedenti.

### 6. Diario dell'Alvo (Bristol Stool Scale)
- [ ] **6.1 Registrazione Evacuazione Bristol 1–7**
  - Selezione visuale intuitiva del Tipo Bristol (illustrazione + descrizione clinica sintetica).
  - Livello di urgenza (`Assente`, `Moderata`, `Severa`).
  - Dolore durante l'evacuazione (Dischezia) 0–10.
  - Sforzo e sensazione di evacuazione incompleta.
  - Presenza di muco o note libere.

### 7. Macchina a Stati del Challenge di Reintroduzione
- [ ] **7.1 Configurazione del Challenge**
  - Selezione gruppo FODMAP e alimento-test dal catalogo personale.
  - Definizione delle 3 dosi progressive (Giorno 1: dose bassa; Giorno 2: dose media; Giorno 3: dose piena).
  - Data programmata di inizio.
- [ ] **7.2 Gestione a Stati Rigorosa**
  - Stati gestiti: `Pianificato` ➡️ `Attesa baseline` ➡️ `Giorno 1` ➡️ `Giorno 2` ➡️ `Giorno 3` ➡️ `Washout` ➡️ `Completato`.
  - Abilitazione del giorno successivo subordinata al check-in giornaliero.
  - Opzione "Interrompi per sintomi acuti" con transizione immediata a fase di recupero/washout.
- [ ] **7.3 Risultato del Challenge**
  - Assegnazione esito: `Tollerato dose alta`, `Tollerato dose media`, `Tollerato solo dose iniziale`, `Sintomi lievi ma accettabili`, `Non tollerato`, `Dubbio`.
  - Conferma manuale dell'utente prima di aggiornare automaticamente la scheda dell'alimento.

### 8. Modulo Endometriosi Essenziale
- [ ] **8.1 Tracciamento Ciclo & Sintomi Pelvici**
  - Registrazione giorno del ciclo o flag amenorrea (terapia ormonale continua).
  - Separazione esplicita tra Dolore Addominale generico e Dolore Pelvico / Dismenorrea.
  - Flag "Endo-belly" (distensione infiammatoria non correlata al pasto).
- [ ] **8.2 Avviso di Confondimento Mestruale**
  - Se un sintomo si verifica durante il flusso mestruale o picco pelvico, l'app avverte che la reazione potrebbe essere ormonale e non legata al cibo testato.

### 9. Dashboard Oggi & Timeline Giornaliera
- [ ] **9.1 Schermata Home "Oggi"**
  - Visualizzazione fase attuale e challenge in corso.
  - Livello sintomatico odierno e stato rispetto al baseline.
  - 3 pulsanti ad alto contrasto per azioni immediate:
    - ➕ *Aggiungi Pasto*
    - ⚡ *Check-in Rapido*
    - 🚽 *Registra Evacuazione*
- [ ] **9.2 Timeline Cronologica**
  - Flusso integrato in ordine temporale di pasti, sintomi ed evacuazioni della giornata.

### 10. Backup & Esportazione Locale
- [ ] **10.1 Esportazione JSON Integrale**
  - Download di un file `.json` contenente l'intero dump del database IndexedDB.
- [ ] **10.2 Importazione & Ripristino Backup**
  - Validazione schema JSON e ripristino sicuro dei dati.

---

## 🎯 Criteri di Accettazione MVP
1. L'app si installa su smartphone e funziona in modalità aereo senza errori di rete.
2. Un pasto con 3 ingredienti può essere inserito e salvato in meno di 25 secondi.
3. Il check-in rapido dei sintomi richiede meno di 10 secondi.
4. L'inserimento di una registrazione Bristol richiede 3 tap.
5. Il challenge a 3 dosi transita regolarmente tra i vari stati e non assegna verdetti senza conferma dell'utente.
6. L'esportazione JSON genera un file leggibile e re-importabile con successo.
