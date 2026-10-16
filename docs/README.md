# Documentazione del Progetto FODMAP Path (Fudy)

Benvenuto nella documentazione architetturale e funzionale di **FODMAP Path**, la Progressive Web App (PWA) *local-first* progettata per guidare l'utente attraverso le tre fasi della dieta low-FODMAP (Riduzione, Reintroduzione guidata e Personalizzazione), con supporto avanzato per la dose-dipendenza, diario dell'alvo (Bristol Stool Scale), modulo opzionale per l'endometriosi e rigorosa tutela della privacy (*Privacy by Design*).

---

## 📚 Indice della Documentazione

1. [**Specifiche Funzionali Dettagliate**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/SPECIFICHE_FUNZIONALI.md)
   - Filosofia del prodotto e principio dose-dipendente
   - Modulo Onboarding & Baseline iniziale
   - Schede Alimenti e gestione porzioni (Dato oggettivo vs Tolleranza soggettiva)
   - Schede Pasti e snapshot storico immutabile
   - Check-in Rapido (<15s) ed Esteso (dolore addominale vs pelvico vs gonfiore)
   - Diario dell'Alvo (Scala Bristol 1–7)
   - Macchina a Stati dei Challenge di Reintroduzione (3 dosi progressive)
   - Fase di Personalizzazione e Retest programmati
   - Modulo Endometriosi e discriminazione dei confondenti ciclici
   - Motore di Analisi, Finestre Temporali (4h) e Livelli di Evidenza
   - Sicurezza Clinica: Red Flags e Protezione da Iper-Restrizione
   - Proprietà Intellettuale & Gestione Dati (Rispetto copyright Monash)

2. [**Architettura Tecnica & Modello Dati**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/ARCHITETTURA_TECNICA.md)
   - Architettura *Domain-Driven* disaccoppiata dalla UI
   - PWA Local-First: IndexedDB, Service Worker, Manifest, Offline-first
   - Schema delle Entità e Relazioni (TypeScript Domain Interfaces)
   - Snapshotting dei pasti e consistenza storica
   - Privacy by Design e GDPR (dati sanitari sensibili, nessun tracciamento)
   - Strategia di Export/Import (JSON/CSV) e Crittografia locale (PIN opzionale)

3. [**Roadmap di Sviluppo Modulari**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/README.md)
   - [**Roadmap MVP (Fase 1)**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_MVP.md): Funzionalità indispensabili per un uso quotidiano sicuro ed efficace
   - [**Roadmap v1.0 (Fase 2)**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_V1.md): Consolidamento, dashboard andamenti, report PDF/CSV, confounding tracking e verifiche cliniche di sicurezza
   - [**Roadmap v2.0+ (Fase 3)**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_V2_FUTURE.md): Condivisione clinica sicura, sync cifrata end-to-end opzionale, barcode e internazionalizzazione

---

## 🎯 Navigazione Principale dell'Applicazione

La UI si articola su **5 macro-sezioni**:
- **Oggi**: Registrazione immediata (Check-in rapido, pasto rapido, evacuazione rapida, stato challenge in corso).
- **Diario**: Timeline oraria integrata di pasti, sintomi, evacuazioni e note.
- **Percorso**: Visualizzazione della fase attuale (Baseline, Riduzione, Reintroduzione, Personalizzazione) e gestione Challenge.
- **Alimenti**: Catalogo alimenti personali con stato di tolleranza verificato e filtri specifici.
- **Progressi**: Andamento sintomi, correlazioni senza pretesa diagnostica, reportistica ed esportazione.
