# FODMAP Path (Fudy) 🌿

**FODMAP Path** è una Progressive Web App (PWA) *local-first*, installabile e utilizzabile al 100% offline, che accompagna la persona attraverso le **tre fasi della dieta low-FODMAP**: **Riduzione**, **Reintroduzione guidata** e **Personalizzazione**, con un focus prioritario sulla **dose-dipendenza**, sul diario dell'alvo (**Bristol Stool Scale**) e su un modulo dedicato all'**endometriosi**.

---

## 💡 Il Principio Fondamentale

Un alimento non risponde alla domanda *"Quante volte posso mangiarlo?"*, bensì a:
- **Quale porzione** esatta è stata consumata?
- In **quale fase** della dieta?
- Quale **gruppo FODMAP** si sta testando?
- Quanto è stato tollerato a quella determinata dose?
- Il risultato è stato confermato da un **challenge controllato** a dosi crescenti?
- Qual è la **porzione massima attualmente tollerata**?
- Quando è opportuno **ritestarlo**?

---

## 📖 Documentazione Completa del Progetto

Tutta la documentazione di prodotto, architettura tecnica e pianificazione operativa è disponibile nella cartella [`docs/`](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/):

1. 📋 [**Indice della Documentazione**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/README.md)
2. 🔬 [**Specifiche Funzionali Dettagliate**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/SPECIFICHE_FUNZIONALI.md)
   - Onboarding guidato e baseline pre-dieta
   - Schede alimenti a 4 livelli (Dato, Esperienza, Challenge, Regola)
   - Schede pasti e snapshot immutabile (non altera lo storico passato)
   - Check-in rapido (< 15 secondi) e Check-in esteso
   - Diario Bristol (1–7) e dischezia
   - Macchina a stati dei challenge di reintroduzione (3 dosi progressive)
   - Modulo endometriosi & correlazione ormonale non confondente
   - Motore di analisi, finestre temporali (4h) e livelli di evidenza
   - Sicurezza clinica: Red Flags e prevenzione dell'iper-restrizione (anti-ortoressia)
   - Privacy by Design e rispetto del copyright (no dati proprietari Monash non autorizzati)
3. 🏗️ [**Architettura Tecnica & Modello Dati**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/ARCHITETTURA_TECNICA.md)
   - Architettura Domain-Driven (TypeScript puro per la logica clinica)
   - Persistenza IndexedDB con migrazioni versionate
   - Privacy GDPR sui dati sanitari (nessun tracker, zero account remoti)
   - Crittografia locale (PIN opzionale) ed esportazione/importazione JSON/CSV

---

## 🗺️ Roadmap di Sviluppo

Lo sviluppo dell'applicazione è articolato in 3 roadmap modulari per organizzare il lavoro futuro con la massima efficienza:

- 🟢 [**Roadmap MVP (Fase 1)**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_MVP.md)  
  *Focus:* PWA offline, Onboarding & Baseline, CRUD Alimenti & Pasti con porzioni, Check-in <15s, Diario Bristol, Macchina a stati Challenge 3-dosi, Modulo Endometriosi base, Export/Import JSON.
- 🟡 [**Roadmap v1.0 (Fase 2)**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_V1.md)  
  *Focus:* Dashboard andamenti settimanali, Confronto Baseline/Fase, Periodo di Washout guidato, Retest programmati (3-6 mesi), Report PDF/CSV per il medico, Fattori confondenti (stress, sonno, alcol, farmaci), Verifiche di sicurezza clinica e accessibilità.
- 🔵 [**Roadmap v2.0+ (Fase 3 & Evoluzioni Future)**](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_V2_FUTURE.md)  
  *Focus:* Condivisione temporanea sicura con il dietista (read-only link), Sincronizzazione crittografata end-to-end opzionale (Zero-Knowledge), Barcode scanner & OCR ingredienti, internazionalizzazione.

---

## 📱 Struttura di Navigazione dell'App

L'applicazione organizza la sua interfaccia in **5 sezioni essenziali nella barra inferiore**:
1. **Diario (`#home`):** Registrazione pasti (veloce o con ingredienti), lista dei cibi consumati oggi, consigli di rotazione e tasto rapido `⚡ Sintomi`.
2. **Alimenti (`#alimenti`):** Archivio personale dei cibi con categorie, gruppi FODMAP, stato di tolleranza e tasto per importare file JSON.
3. **Challenge (`#challenge`):** Protocollo guidato di reintroduzione a 3 dosi e percorsi di riposo intestinale (Washout).
4. **Progressi (`#progressi`):** Analisi statistica dei cibi trigger, istogramma Bristol ed esportazione report PDF/CSV per il medico.
5. **Profilo (`#onboarding`):** Configurazione e modifica in ogni momento della fase della dieta, obiettivi e sintomi di partenza.

---

## 🚀 Guida Rapida: Come Usare l'App Partendo da Zero

Se è la prima volta che apri FODMAP Path, ecco il percorso ideale in 4 passi:

```
[ 1. Profilo ] ➔ [ 2. Alimenti ] ➔ [ 3. Diario ] ➔ [ 4. Challenge & Report ]
 (Fase e Baseline)  (Importa o Crea)   (Pasti e Sintomi)   (Test 3 Dosi ed Export)
```

1. **👤 Imposta il tuo punto di partenza (Profilo):**
   - Vai su **Profilo** per indicare la tua fase attuale (es. *Riduzione/Eliminazione*) e il livello medio di dolore e gonfiore abituale (*Baseline*). Questi valori serviranno all'app per misurare i tuoi progressi.

2. **🥦 Prepara i tuoi cibi (Alimenti):**
   - Vai su **Alimenti**: puoi aggiungere i cibi che consumi abitualmente con il tasto `+ Nuovo`, oppure importare direttamente un archivio JSON con il tasto `📥 Importa`.

3. **📖 Compila la tua giornata (Diario):**
   - **Quando mangi:** tocca `+ Registra Pasto con Ingredienti` per inserire cosa hai mangiato (con grammi e orario). Se mangi fuori casa, spunta l'apposita casella per tenere conto delle stime.
   - **Come ti senti:** tocca `⚡ Sintomi` per registrare con uno slider il dolore o il gonfiore (da 0 a 10), oppure tocca *"Tutto OK (0/10)"* se non avverti fastidi. Puoi annotare anche l'evacuazione (Scala Bristol).

4. **🧪 Testa i tuoi limiti e condividi i risultati (Challenge & Progressi):**
   - Quando sei stabile, vai su **Challenge** per testare un gruppo FODMAP a dosi crescenti per 3 giorni (es. 1/4 dose, 1/2 dose, dose piena). Se compaiono sintomi, l'app avvia automaticamente il *Washout* (riposo digestivo).
   - Vai su **Progressi** per vedere quali cibi risultano statisticamente associati ai tuoi sintomi e scaricare il **Report PDF stampabile** o i file **CSV** da portare al tuo dietista o gastroenterologo.

> 🔒 **Privacy totale:** Tutti i tuoi dati restano salvati **esclusivamente nel tuo browser** (IndexedDB locale). L'app funziona al 100% offline e nessun dato viene mai trasmesso a server esterni.
