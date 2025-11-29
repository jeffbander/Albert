# Patient AI Assistant - Setup Guide

This guide explains how to create personalized AI assistants for patients that communicate via WhatsApp.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    WhatsApp     │────▶│   Your Server    │────▶│    OpenAI       │
│  (Meta/Twilio)  │◀────│   (Vercel)       │◀────│    GPT-4o       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │   Turso (DB)     │
                    │   + Mem0         │
                    └──────────────────┘
```

**Key Features:**
- Each patient gets a **personalized AI assistant** that learns their communication style
- AI assistants remember past conversations and evolve their personality
- Automatic alerting for concerning messages (symptoms, distress, etc.)
- Family member support for care updates
- Full HIPAA-ready audit logging

## Deployment Strategy

### Option 1: Single Deployment, Multiple Patients (Recommended)

All patients share the same codebase but have separate data isolated by `patient_id`.

**Pros:**
- Simple to maintain
- Cost-effective
- Easy updates

**Cons:**
- Single point of failure
- All patients on same domain

```bash
# Deploy once to Vercel
vercel deploy --prod
```

### Option 2: Separate Deployments Per Patient/Practice

For complete isolation, deploy separate instances:

```bash
# Create patient-specific branch
git checkout -b patient/landau

# Update environment with patient-specific database
# Deploy to patient-specific URL
vercel deploy --prod --name albert-landau
```

**Pros:**
- Complete data isolation
- Custom domains per patient/practice
- Independent scaling

**Cons:**
- More expensive
- More maintenance

## Setup Steps

### 1. Create Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create albert-patients

# Get credentials
turso db show albert-patients --url
turso db tokens create albert-patients
```

### 2. Set Up WhatsApp Business API

#### Option A: Meta WhatsApp Cloud API (Recommended)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app → Select "Business" type
3. Add WhatsApp product to your app
4. Go to WhatsApp → API Setup
5. Get your:
   - Phone Number ID
   - WhatsApp Business Account ID
   - Generate a permanent access token

#### Option B: Twilio WhatsApp

1. Sign up at [Twilio](https://www.twilio.com/)
2. Go to Messaging → Try it Out → Send a WhatsApp message
3. Follow the sandbox setup (or apply for production number)
4. Get your Account SID, Auth Token, and WhatsApp number

### 3. Configure Webhook

After deploying, configure your webhook URL:

**For Meta:**
1. In Meta Developer Console → WhatsApp → Configuration
2. Set Webhook URL: `https://your-domain.vercel.app/api/whatsapp/webhook`
3. Set Verify Token: (same as `WHATSAPP_META_WEBHOOK_VERIFY_TOKEN`)
4. Subscribe to: `messages`

**For Twilio:**
1. In Twilio Console → WhatsApp → Sandbox Settings
2. Set "When a message comes in": `https://your-domain.vercel.app/api/whatsapp/webhook`
3. Set method to POST

### 4. Add Your First Patient

```bash
curl -X POST https://your-domain.vercel.app/api/patients \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "LANDAU001",
    "first_name": "Richard",
    "last_name": "Landau",
    "phone_number": "+15551234567",
    "email": "richard@example.com",
    "medical_context": "Managing Type 2 diabetes, recent A1C improvement",
    "ai_personality_preset": "supportive"
  }'
```

### 5. Customize AI Personality

```bash
curl -X PUT https://your-domain.vercel.app/api/patients/PATIENT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "ai_model": {
      "personality_warmth": 0.9,
      "personality_directness": 0.6,
      "personality_medical_detail": 0.7,
      "personality_encouragement": 0.8,
      "conditions": ["Type 2 Diabetes", "Hypertension"],
      "medications": ["Metformin 500mg", "Lisinopril 10mg"],
      "care_team_notes": [
        "Responds well to positive reinforcement",
        "Prefers morning check-ins",
        "Family very supportive - wife Carol"
      ],
      "topics_to_encourage": ["Exercise progress", "Diet wins"],
      "topics_to_avoid": ["Weight numbers directly"]
    }
  }'
```

### 6. Add Family Members

```bash
curl -X PUT https://your-domain.vercel.app/api/patients/PATIENT_ID \
  -H "Content-Type: application/json" \
  -d '{
    "add_family_member": {
      "name": "Carol Landau",
      "relationship": "spouse",
      "phone_number": "+15559876543",
      "can_receive_updates": true
    }
  }'
```

## API Reference

### Patients

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients` | GET | List all patients |
| `/api/patients` | POST | Create new patient |
| `/api/patients/[id]` | GET | Get patient details |
| `/api/patients/[id]` | PUT | Update patient |
| `/api/patients/[id]` | DELETE | Deactivate patient |

### Alerts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/alerts` | GET | Get unacknowledged alerts |
| `/api/patients/alerts` | POST | Acknowledge alert |

### WhatsApp

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/whatsapp/webhook` | GET | Webhook verification |
| `/api/whatsapp/webhook` | POST | Handle incoming messages |
| `/api/whatsapp/send` | POST | Send outbound messages |

### Send Message Examples

```bash
# Send custom message
curl -X POST https://your-domain.vercel.app/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_message",
    "patient_id": "...",
    "message": "Hi! Just checking in - how are you feeling today?"
  }'

# Send AI-generated check-in
curl -X POST https://your-domain.vercel.app/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send_check_in",
    "patient_id": "..."
  }'

# Send daily check-ins to all patients (for cron)
curl -X POST https://your-domain.vercel.app/api/whatsapp/send \
  -H "Content-Type: application/json" \
  -d '{"action": "daily_check_ins"}'
```

## Setting Up Daily Check-ins

Use Vercel Cron or an external service to trigger daily check-ins:

**vercel.json:**
```json
{
  "crons": [{
    "path": "/api/whatsapp/send",
    "schedule": "0 9 * * *"
  }]
}
```

You'll need to modify the route to accept GET requests for cron, or use a cron service that sends POST.

## Monitoring Alerts

The AI automatically flags concerning messages. Check alerts regularly:

```bash
# Get all unacknowledged alerts
curl https://your-domain.vercel.app/api/patients/alerts

# Acknowledge an alert
curl -X POST https://your-domain.vercel.app/api/patients/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "alert_id": "...",
    "acknowledged_by": "Dr. Bander"
  }'
```

## AI Behavior

The AI assistant:

1. **Remembers Everything** - Past conversations, preferences, concerns
2. **Learns Communication Style** - Adapts warmth, directness, detail level
3. **Never Diagnoses** - Always defers medical decisions to care team
4. **Flags Concerns** - Automatically creates alerts for:
   - New/worsening symptoms
   - Medication issues
   - Emotional distress
   - Missed medications/appointments
5. **Stays Within Bounds** - Crisis situations trigger immediate resources

## Security Considerations

- All messages are logged for HIPAA compliance
- Patient data isolated by ID
- Soft-delete ensures data preservation
- Consider adding API authentication for production
- Use environment variables for all secrets

## Cost Estimates

| Service | Cost |
|---------|------|
| Vercel | Free tier or ~$20/mo |
| Turso | Free tier (500 DBs, 9GB) |
| Mem0 | Free tier or ~$10/mo |
| OpenAI | ~$0.01-0.03 per conversation |
| WhatsApp (Meta) | Free for first 1000/mo, then ~$0.005/msg |
| Twilio | ~$0.005/message |

For a practice with 50 patients averaging 2 conversations/day: ~$50-100/month total.

## Questions?

This system was designed to be:
- **Simple**: One codebase, multiple patients
- **Scalable**: Add patients via API
- **Compliant**: Full audit logging
- **Effective**: AI that genuinely helps patients between visits

For customizations or questions, review the source code in:
- `lib/patient-db.ts` - Database schema and queries
- `lib/patient-ai.ts` - AI conversation handling
- `lib/whatsapp.ts` - WhatsApp integration
- `app/api/` - API endpoints
