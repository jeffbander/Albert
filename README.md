# CareSync AI

**Medical AI Patient Assistant with WhatsApp Integration**

AI-powered health companions that communicate with your patients via WhatsApp, providing continuous care between appointments.

## Features

- **Medical-Grade AI** - Clinical reasoning, symptom assessment, red flag detection
- **WhatsApp Integration** - Patients text, AI responds with personalized care
- **Per-Patient Personalization** - Each patient gets their own AI that learns their needs
- **Automatic Alerts** - Care team notified of concerning symptoms
- **HIPAA-Ready Logging** - Full audit trail of all communications

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Run development server
npm run dev
```

## Environment Variables

```
OPENAI_API_KEY=sk-...          # GPT-4o for medical reasoning
MEM0_API_KEY=...               # Semantic memory
TURSO_DATABASE_URL=libsql://   # Patient database
TURSO_AUTH_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...      # Meta WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients` | GET | List all patients |
| `/api/patients` | POST | Create new patient |
| `/api/alerts` | GET | Get unacknowledged alerts |
| `/api/alerts` | POST | Acknowledge alert |
| `/api/whatsapp/webhook` | POST | Handle incoming messages |

## Creating a Patient

```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "PAT001",
    "first_name": "John",
    "last_name": "Smith",
    "phone_number": "+15551234567",
    "conditions": ["Type 2 Diabetes", "Hypertension"],
    "medications": ["Metformin 500mg BID", "Lisinopril 10mg daily"],
    "allergies": ["Penicillin"],
    "primary_doctor": "Dr. Bander"
  }'
```

## Medical Knowledge

The AI understands:
- **Conditions**: Diabetes, Hypertension, COPD, Heart Failure, CKD, Depression, Anxiety
- **Medications**: Metformin, ACE inhibitors, Statins, PPIs, SSRIs, Bronchodilators
- **Symptom Patterns**: Cardiac, respiratory, mental health, medication concerns
- **Drug Interactions**: Common interaction warnings
- **Crisis Detection**: Suicidal ideation, emergency symptoms

## How It Works

1. Patient texts your WhatsApp number
2. Webhook receives message, identifies patient
3. AI builds context from medical profile + conversation history
4. Response generated with clinical reasoning
5. Concerning symptoms automatically create alerts
6. Care team reviews alerts in dashboard

## Safety Boundaries

The AI will **never**:
- Diagnose conditions
- Recommend medication changes
- Replace physician care

The AI **will**:
- Recognize red flags and escalate
- Provide health education
- Support medication adherence
- Offer emotional support
- Alert care team to concerns

## Deployment

### Vercel (Recommended)

```bash
vercel deploy --prod
```

Then configure webhook URL in Meta WhatsApp settings:
`https://your-app.vercel.app/api/whatsapp/webhook`

## License

Private - Bander Labs
