# Indice delle Roadmap di Sviluppo — FODMAP Path (Fudy)

Per garantire una consegna incrementale, affidabile e clinicamente solida, lo sviluppo di **FODMAP Path** è suddiviso in 3 milestone progressive, ciascuna con compiti chiari, criteri di accettazione e priorità ben definite.

---

## 🧭 Struttura delle Roadmap

| Roadmap | Obiettivo | Stato & Priorità | Documento |
|---|---|---|---|
| **Fase 1: MVP** | **Core Funzionale & Local-First:** Onboarding, CRUD alimenti/pasti con porzioni, Check-in <15s, Diario Bristol, Macchina a stati Challenge (3 dosi), Modulo Endometriosi essenziale, Privacy e backup JSON. | 🟢 **Priorità Immediata** | [ROADMAP_MVP.md](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_MVP.md) |
| **Fase 2: v1.0** | **Maturità Clinica & Analitica:** Dashboard settimanale, Baseline vs Fase corrente, Washout guidato, Retest calendarizzati, Reportistica PDF/CSV per il medico, Fattori confondenti, Controlli anti-ortoressia e Red Flags. | 🟡 **Media Priorità** | [ROADMAP_V1.md](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_V1.md) |
| **Fase 3: v2.0+** | **Estensione & Collaborazione:** Condivisione temporanea sicura con il dietista, Sync cifrata end-to-end multi-dispositivo, Barcode reader ingredienti, Internazionalizzazione. | 🔵 **Futuro / Post-v1.0** | [ROADMAP_V2_FUTURE.md](file:///c:/Users/loris/Documents/Programmazione/App/Fudy/docs/roadmap/ROADMAP_V2_FUTURE.md) |

---

## 📐 Criteri Guida di Sviluppo

1. **Nessun debito clinico:** Un'applicazione medica non deve mai semplificare eccessivamente concetti complessi come la dose-dipendenza o confondere il dolore mestruale con la fermentazione da FODMAP.
2. **Architettura Domain-First:** Ogni entità di business (Pasto, Challenge, Sintomo) viene implementata e testata con logica pura TypeScript prima di essere collegata alla UI.
3. **Velocità d'uso quotidiano:** Le registrazioni frequenti (check-in rapido e Bristol) devono richiedere meno di 15 secondi per azzerare il tasso di abbandono del paziente.
4. **Zero telemetria:** Rispetto rigoroso dei dati sensibili della salute sul dispositivo dell'utente.
