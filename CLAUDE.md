# Echo - Albert Voice Assistant

## Project Overview

Echo is an AI-powered voice assistant named "Albert" that provides real-time conversational AI with advanced capabilities including browser automation, research integration, and self-improvement features.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Voice API**: OpenAI Realtime API
- **AI Models**: GPT-4o-realtime, Claude (via Anthropic API)
- **Database**: LibSQL/Turso
- **Browser Automation**: Playwright, claude-in-chrome MCP
- **Styling**: Tailwind CSS

## Key Features

### Voice Interface
- Real-time voice conversations via OpenAI Realtime API
- WebRTC audio streaming with VAD (Voice Activity Detection)
- Custom voice profiles and speaker identification

### NotebookLM Research Integration (NEW)
Albert can control Google's NotebookLM to conduct research:

**Voice Commands:**
- "Research [topic]" - Creates a new NotebookLM notebook
- "Add this article: [URL]" - Adds sources to the research
- "What are the key findings?" - Asks NotebookLM questions
- "Summarize the research" - Gets comprehensive overview
- "Close the research" - Ends the session

**Architecture:**
```
Voice Command -> /api/notebooklm -> Playwright CDP -> Chrome -> NotebookLM
                      |
              SSE Progress Stream -> Voice Updates
```

**Files:**
- `lib/notebookLMController.ts` - Browser automation via Playwright CDP
- `lib/researchSessionStore.ts` - Session state management
- `app/api/notebooklm/route.ts` - API endpoints
- `app/api/notebooklm/[sessionId]/stream/route.ts` - SSE progress streaming

**Setup for Voice Commands:**
```bash
# Launch Chrome with debugging enabled (required for API-based control)
scripts\launch-chrome-debug.bat

# Or manually:
chrome.exe --remote-debugging-port=9222
```

### Browser Automation
- Full browser control via claude-in-chrome MCP
- Page navigation, clicking, typing, screenshots
- Form filling and data extraction

### Self-Improvement System
- Automated code analysis and improvement suggestions
- Git integration for tracking changes
- Progress streaming via SSE

### Knowledge Graph
- Visual representation of conversation topics
- Relationship mapping between concepts
- Interactive graph exploration at `/graph`

### Voice Profiles
- Speaker identification and management
- Custom voice settings per profile
- Accessible at `/speakers`

## Project Structure

```
echo/
├── app/
│   ├── api/
│   │   ├── notebooklm/          # NotebookLM research API
│   │   ├── build/               # Build system API
│   │   ├── chat/                # Chat completions
│   │   ├── realtime/            # Voice session management
│   │   └── self-improve/        # Self-improvement system
│   ├── builder/                 # Project builder UI
│   ├── graph/                   # Knowledge graph UI
│   ├── speakers/                # Voice profiles UI
│   └── page.tsx                 # Main voice interface
├── components/
│   ├── VoiceOrb.tsx            # Voice visualization orb
│   ├── ChatPanel.tsx           # Text chat interface
│   └── ...
├── lib/
│   ├── buildTools.ts           # Voice tool definitions
│   ├── notebookLMController.ts # Browser automation
│   ├── researchSessionStore.ts # Research session state
│   └── ...
├── types/
│   └── research.ts             # Research type definitions
└── scripts/
    └── launch-chrome-debug.bat # Chrome debug launcher
```

## Voice Tools

Albert has access to these voice-activated tools:

| Tool | Description |
|------|-------------|
| `start_research` | Start NotebookLM research session |
| `add_research_source` | Add URL/YouTube/text to research |
| `ask_notebook` | Ask questions about research |
| `get_research_summary` | Get research overview |
| `close_research` | End research session |
| `create_build_project` | Create new code project |
| `run_terminal_command` | Execute shell commands |
| `search_web` | Search the internet |
| `open_url` | Navigate browser to URL |

## Environment Variables

See `.env.example` for a complete list of environment variables.

### Required Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o Realtime voice |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `TURSO_DATABASE_URL` | Turso/LibSQL database URL |
| `TURSO_AUTH_TOKEN` | Turso authentication token |
| `BROWSER_PROVIDER` | `local-cdp` (dev) or `browserbase` (prod) |
| `CHROME_DEBUG_PORT` | Chrome debugging port (default: 9222) |
| `BROWSERBASE_API_KEY` | Browserbase API key (for production) |
| `BROWSERBASE_PROJECT_ID` | Browserbase project ID |
| `NEXTAUTH_SECRET` | NextAuth.js secret key |
| `GMAIL_ENABLED` | Enable Gmail integration |

## Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Deployment

### Local Development Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd Albert
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start Chrome with debugging (for browser automation):**
   ```bash
   # Windows
   scripts\launch-chrome-debug.bat

   # macOS
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

   # Linux
   google-chrome --remote-debugging-port=9222
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   Open [http://localhost:3000](http://localhost:3000)

### Browserbase Setup (Production Browser Automation)

For production deployments, use [Browserbase](https://browserbase.com) instead of local Chrome:

1. **Create a Browserbase account** at https://browserbase.com

2. **Get your credentials:**
   - API Key from the dashboard
   - Project ID from your project settings

3. **Configure environment variables:**
   ```env
   BROWSER_PROVIDER=browserbase
   BROWSERBASE_API_KEY=your-api-key
   BROWSERBASE_PROJECT_ID=your-project-id
   ```

4. **Use the config helper in your code:**
   ```typescript
   import { config, getBrowserConnectionUrl } from '@/lib/config';

   const browserUrl = getBrowserConnectionUrl();
   // Automatically uses Browserbase in production, local CDP in development
   ```

### Vercel Deployment

1. **Connect your repository:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Select the Next.js framework preset

2. **Configure environment variables:**
   In Vercel dashboard, add the following environment variables:

   **Required:**
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `NEXTAUTH_SECRET` (generate with `openssl rand -base64 32`)
   - `NEXTAUTH_URL` (your production URL, e.g., `https://albert.vercel.app`)

   **Database:**
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`

   **Browser Automation (if using):**
   - `BROWSER_PROVIDER=browserbase`
   - `BROWSERBASE_API_KEY`
   - `BROWSERBASE_PROJECT_ID`

   **Optional:**
   - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` (for Gmail integration)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (for Google OAuth)

3. **Deploy:**
   ```bash
   vercel --prod
   ```

4. **Verify deployment:**
   - Check the deployment logs for any errors
   - Test voice functionality
   - Verify browser automation if enabled

### Docker Deployment (Alternative)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### Configuration Validation

The application includes built-in configuration validation. Use it to verify your setup:

```typescript
import { validateConfig, getValidationResult } from '@/lib/config';

// Throws an error if required variables are missing
validateConfig();

// Or get detailed validation results
const result = getValidationResult();
if (!result.valid) {
  console.error('Missing:', result.missing);
}
if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

### Feature Flags

Check if features are available based on configuration:

```typescript
import { features } from '@/lib/config';

if (features.gmail()) {
  // Gmail integration is configured
}

if (features.browserAutomation()) {
  // Browser automation is available
}

if (features.database()) {
  // Database is configured
}
```

## MCP Servers

The project integrates with these MCP servers:
- **claude-in-chrome**: Browser automation and control
- **playwright-mcp**: Advanced browser automation

## Recent Updates

### January 2026
- Added NotebookLM research integration
- Implemented Playwright CDP browser control
- Added research progress streaming via SSE
- Created 5 new voice tools for research
