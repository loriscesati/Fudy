# Architettura Tecnica & Modello Dati — FODMAP Path (Fudy)

---

## 1. Principi Guida dell'Architettura

1. **Local-First & Offline-First:**
   Tutti i dati dell'utente risiedono nel browser del dispositivo tramite **IndexedDB**. L'applicazione funziona al 100% senza connessione internet grazie a un Service Worker moderno e al Web App Manifest.
2. **Privacy by Design & Conformità GDPR:**
   I dati trattati (abitudini alimentari, sintomi gastrointestinali, evacuazioni, ciclo mestruale ed endometriosi) appartengono alle *categorie particolari di dati personali* (dati sanitari ex art. 9 GDPR). Nessun dato lascia il dispositivo, nessun cookie di profilazione, nessun SDK pubblicitario né tracker remoto.
3. **Disaccoppiamento Domain / Application / Infrastructure / UI:**
   La logica clinica della dieta low-FODMAP, la macchina a stati dei challenge e gli algoritmi di calcolo delle finestre temporali sono completamente isolati dall'interfaccia utente. Questo garantisce testabilità unitaria del 100% e rende l'architettura pronta per qualsiasi frontend (SvelteKit, React, Vue) o futuro backend crittografato.
4. **Immutabilità dei Pasti Storici (Snapshot Pattern):**
   I pasti salvati conservano una copia storica delle proprietà degli alimenti consumati, evitando che modifiche successive alle schede alimentari alterino il diario passato.

---

## 2. Struttura dei Moduli (`src/`)

```
src/
├── domain/                      # Modello di dominio puro (zero dipendenze UI)
│   ├── foods/                   # Entità Food, Porzione, Gruppo FODMAP
│   ├── meals/                   # Entità Meal, MealItem, Snapshot
│   ├── symptoms/                # Check-in rapido, esteso, score 0-10
│   ├── bowel/                   # Registrazione alvo Bristol 1-7, dischezia
│   ├── challenges/              # Macchina a stati Challenge 3-dosi
│   ├── cycle/                   # Modulo ciclo mestruale ed endometriosi
│   ├── confounders/             # Stress, sonno, alcol, farmaci
│   └── insights/                # Finestre temporali (4h) e livelli evidenza
├── application/                 # Casi d'uso e orchestrazione (Commands & Queries)
│   ├── commands/                # RecordMeal, SubmitCheckIn, AdvanceChallenge, ecc.
│   ├── queries/                 # GetTodaySummary, GetToleranceMap, GetBristolStats
│   └── services/                # ExportService, BackupEncryptionService
├── infrastructure/              # Implementazioni concrete di persistenza e IO
│   ├── storage/                 # Adapter IndexedDB (idb wrapper tipizzato)
│   ├── export/                  # Serializzatori JSON, CSV e generatori PDF
│   └── pwa/                     # Service Worker, Cache Strategy, Install Prompt
└── ui/                          # Interfaccia grafica utente
    ├── components/              # Design System atomico (pulsanti, slider, card)
    ├── navigation/              # Bottom navigation bar (5 sezioni)
    └── pages/                   # Schermate principali:
        ├── Oggi/                # Dashboard rapida giornaliera
        ├── Diario/              # Timeline oraria unificata
        ├── Percorso/            # Fasi dieta & Challenge attivo
        ├── Alimenti/            # Catalogo alimenti & mappa tolleranze
        └── Progressi/           # Andamenti, reportistica & export
```

---

## 3. Modello Dati Tipizzato (TypeScript Domain Interfaces)

### 3.1 Gruppi FODMAP & Fasi Dietetiche
```typescript
export type FodmapGroup =
  | 'FRUCTANS_GRAIN'       // Fruttani da cereali (frumento, segale, orzo)
  | 'FRUCTANS_VEG_GARLIC'  // Fruttani da aglio, cipolla e verdure
  | 'GOS'                  // Galatto-oligosaccaridi (legumi, frutta secca)
  | 'LACTOSE'              // Lattosio (latticini freschi)
  | 'EXCESS_FRUCTOSE'      // Fruttosio in eccesso sul glucosio (miele, fichi)
  | 'SORBITOL'             // Sorbitolo (mele, pere, drupacee)
  | 'MANNITOL'             // Mannitolo (funghi, cavolfiore)
  | 'LOW_FODMAP_SAFE';     // Alimento intrinsecamente a basso tenore

export type DietPhase =
  | 'BASELINE_OBSERVATION' // Fase 0: Osservazione e preparazione
  | 'RESTRICTION'          // Fase 1: Eliminazione temporanea (2-6 settimane)
  | 'REINTRODUCTION'       // Fase 2: Challenge strutturati
  | 'PERSONALIZATION';     // Fase 3: Dieta allargata personalizzata

export type ToleranceStatus =
  | 'UNTESTED'             // Non provato
  | 'IN_OBSERVATION'        // In osservazione quotidiana
  | 'DOSE_LIMITED'         // Tollerato solo entro specifica dose
  | 'FREELY_TOLERATED'     // Tollerato liberamente in porzioni ordinarie
  | 'NOT_TOLERATED';       // Scatena sintomi costanti
```

### 3.2 Scheda Alimento (`FoodCard`)
```typescript
export interface PortionDefinition {
  amount: number;
  unit: 'g' | 'ml' | 'piece' | 'tbsp' | 'tsp' | 'serving';
  description?: string; // es. "1 vasetto", "3 cucchiai da cucina"
}

export interface FoodCard {
  id: string; // UUID v4
  name: string;
  synonyms: string[];
  category: 'FRUIT' | 'VEGETABLE' | 'GRAIN' | 'LEGUME' | 'DAIRY' | 'PROTEIN' | 'COMPOSITE' | 'BEVERAGE' | 'SNACK' | 'CONDIMENT';
  preparation: ('RAW' | 'COOKED' | 'BOILED_DRAINED' | 'CANNED_RINSED' | 'FERMENTED_SOURDOUGH')[];
  primaryFodmapGroup: FodmapGroup[];
  isGlutenFree: boolean;
  isLactoseFree: boolean;
  
  // Fonte
  dataSource: {
    origin: 'USER_INPUT' | 'DIETITIAN_NOTE' | 'FOOD_LABEL' | 'PUBLIC_LITERATURE';
    referenceUrl?: string;
    notes?: string;
  };
  
  // Esperienza & Tolleranza Personale
  tolerance: {
    status: ToleranceStatus;
    maxToleratedPortion?: PortionDefinition;
    lastTestedDate?: string; // ISO 8601
    evidenceLevel: 'HYPOTHESIS' | 'REPEATED_OBSERVATION' | 'CONTROLLED_CHALLENGE';
    personalNotes?: string;
    scheduledRetestDate?: string;
  };
  
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 Pasti & Snapshot Immutabile (`Meal`)
```typescript
export interface MealItemSnapshot {
  foodId: string;
  foodName: string;
  consumedPortion: PortionDefinition;
  preparationUsed: string;
  fodmapGroupsSnapshot: FodmapGroup[];
  isEstimated: boolean; // true se mangiato fuori casa o quantità a occhio
}

export interface Meal {
  id: string; // UUID v4
  timestamp: string; // ISO 8601 con ora e minuti esatti
  mealType: 'BREAKFAST' | 'MORNING_SNACK' | 'LUNCH' | 'AFTERNOON_SNACK' | 'DINNER' | 'LATE_SNACK';
  isEatingOut: boolean;
  isTemplate: boolean;
  templateName?: string;
  items: MealItemSnapshot[];
  notes?: string;
  createdAt: string;
}
```

### 3.4 Check-in Sintomi (`SymptomCheckIn`)
```typescript
export interface SymptomCheckIn {
  id: string;
  timestamp: string;
  type: 'QUICK' | 'EXTENDED';
  
  // Indici Rapidi Core (0 - 10)
  bloatingIntensity: number;       // Gonfiore 0-10
  abdominalPainIntensity: number;  // Dolore addominale 0-10
  generalComparisonToBaseline: 'BETTER' | 'EQUAL' | 'WORSE';
  noSymptomsFlag: boolean;
  
  // Parametri Estesi (Opzionali)
  visibleDistension?: boolean;
  flatulenceSeverity?: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
  pelvicPainIntensity?: number;    // Dolore pelvico specifico 0-10
  nauseaIntensity?: number;        // 0-10
  evacuationUrgency?: boolean;
  incompleteEvacuation?: boolean;
  onsetMinutesAfterMeal?: number;
  durationMinutes?: number;
}
```

### 3.5 Diario dell'Alvo Bristol (`BowelEvent`)
```typescript
export interface BowelEvent {
  id: string;
  timestamp: string;
  bristolType: 1 | 2 | 3 | 4 | 5 | 6 | 7; // Bristol Stool Scale
  urgency: 'NONE' | 'MODERATE' | 'SEVERE';
  painDuringDefecation: number; // 0-10 (dischezia)
  straining: 'NORMAL' | 'MODERATE' | 'EXCESSIVE';
  incompleteEvacuation: boolean;
  mucusPresent: boolean;
  notes?: string;
}
```

### 3.6 Macchina a Stati del Challenge (`ChallengeSession`)
```typescript
export type ChallengeState =
  | 'PLANNED'
  | 'AWAITING_STABLE_BASELINE'
  | 'DAY_1_ACTIVE'
  | 'DAY_2_ACTIVE'
  | 'DAY_3_ACTIVE'
  | 'ABORTED_SYMPTOMS'
  | 'WASHOUT_PERIOD'
  | 'COMPLETED_PENDING_REVIEW'
  | 'FINALIZED';

export type ChallengeOutcome =
  | 'TOLERATED_HIGH_DOSE'
  | 'TOLERATED_MEDIUM_DOSE'
  | 'TOLERATED_INITIAL_DOSE'
  | 'MILD_SYMPTOMS_ACCEPTABLE'
  | 'SEVERE_SYMPTOMS_FAILED'
  | 'INCONCLUSIVE_CONFOUNDERS'
  | 'ABORTED_EARLY';

export interface ChallengeSession {
  id: string;
  fodmapGroup: FodmapGroup;
  testFoodId: string;
  testFoodName: string;
  startDate: string;
  state: ChallengeState;
  
  // Dosi progressive prestabilite
  doses: {
    day1: PortionDefinition; // Dose test iniziale (bassa)
    day2: PortionDefinition; // Dose intermedia
    day3: PortionDefinition; // Dose piena/ordinaria
  };
  
  currentDay: 1 | 2 | 3 | null;
  dayLogs: {
    day: 1 | 2 | 3;
    date: string;
    doseConsumed: boolean;
    symptomCheckInId?: string;
    maxPain: number;
    maxBloating: number;
    notes?: string;
  }[];
  
  washoutDaysRemaining: number;
  outcome?: ChallengeOutcome;
  confirmedByPatient: boolean;
  updatedToleranceApplied: boolean;
}
```

### 3.7 Modulo Ciclo & Endometriosi (`CycleRecord`)
```typescript
export interface CycleRecord {
  id: string;
  date: string; // YYYY-MM-DD
  cycleDay?: number; // Giorno dall'inizio ultimo ciclo mestruale
  isAmenorrhea: boolean;
  hormonalTherapyType?: 'NONE' | 'COMBINED_PILL' | 'PROGESTIN_ONLY' | 'HORMONAL_IUD' | 'GNRH_ANALOG' | 'OTHER';
  menstrualFlow?: 'NONE' | 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY';
  
  // Sintomi specifici endometriosi (0-10)
  dysmenorrhea: number;          // Dolore crampiforme mestruale
  pelvicPainNonCyclic: number;   // Dolore pelvico cronico
  dyspareunia: number;           // Dolore ai rapporti
  dyschezia: number;             // Dolore evacuazione
  endoBellyDistension: boolean;  // Gonfiore infiammatorio acuto
  
  analgesicsTaken: string[];     // es. ["Ibuprofene 600mg", "Paracetamolo"]
  workRestricted: boolean;
  sleepCompromised: boolean;
}
```

### 3.8 Fattori Confondenti Giornalieri (`DailyConfounders`)
```typescript
export interface DailyConfounders {
  id: string;
  date: string; // YYYY-MM-DD
  stressLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  sleepQuality: 'GOOD' | 'DISTURBED' | 'INSOMNIA';
  unusualPhysicalActivity: boolean;
  heavyMealConsumed: boolean;
  alcoholIntake: boolean;
  travelOrRoutineChange: boolean;
  intercurrentIllness: boolean;
  notes?: string;
}
```

---

## 4. Persistenza Locale (IndexedDB Schema)

L'applicazione utilizza IndexedDB come database transazionale e locale mediante un wrapper tipizzato (`idb`).

### Struttura degli Object Store & Indici
| Object Store | Chiave Primaria | Indici Secondari | Scopo |
|---|---|---|---|
| `foods` | `id` (UUID) | `name`, `category`, `status`, `isArchived` | Catalogo alimenti e tolleranze |
| `meals` | `id` (UUID) | `timestamp`, `mealType`, `isEatingOut` | Diario alimentare storico |
| `symptoms` | `id` (UUID) | `timestamp`, `type` | Check-in sintomi orari/giornalieri |
| `bowel_events` | `id` (UUID) | `timestamp`, `bristolType` | Diario dell'alvo |
| `challenges` | `id` (UUID) | `state`, `fodmapGroup`, `startDate` | Sessioni di reintroduzione |
| `cycle_logs` | `date` (YYYY-MM-DD) | `cycleDay`, `menstrualFlow` | Modulo endometriosi & ciclo |
| `confounders` | `date` (YYYY-MM-DD) | `stressLevel` | Fattori confondenti |
| `user_profile` | `'current'` (singleton) | - | Fasi, baseline iniziale, settings, PIN hash |

---

## 5. Sicurezza, Privacy & Crittografia Locale

### 5.1 Local-First Sandbox
- Nessuna chiamata di telemetria, nessun pixel di tracciamento (Google Analytics, Mixpanel o simili banditi).
- Risorse statiche ospitabili su qualsiasi server statico o GitHub Pages.
- Connessione richiesta esclusivamente una sola volta per scaricare la web app nel Service Worker Cache.

### 5.2 Blocco Locale con PIN (Opzionale)
Poiché il dispositivo potrebbe essere prestato a terzi:
- Possibilità di configurare un codice PIN locale (4-6 cifre).
- Derivazione chiave via **PBKDF2 / Argon2** (Web Crypto API nativa) con salt univoco memorizzato localmente.
- Session storage per mantenere sbloccata la schermata durante l'uso, con lock automatico dopo 5 minuti di inattività.

### 5.3 Esportazione, Importazione & Distruzione Dati
- **Esportazione JSON Completa:** Backup di tutti gli store IndexedDB in un singolo file `.json` decifrato o cifrato con password (AES-GCM).
- **Esportazione CSV:** Fogli separati per Pasti, Sintomi, Bristol e Challenge per revisione specialistica.
- **Report PDF Sintetico per Dietista/Medico:** Generazione client-side (es. jsPDF / html2canvas) di un report di 2 pagine con timeline, baseline e tolleranze verificate.
- **Cancellazione Totale Istantanea (Diritto all'Oblio):** Pulsante dedicato nelle impostazioni che cancella fisicamente tutti i database IndexedDB, le chiavi localStorage e svuota la cache del Service Worker.
