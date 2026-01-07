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

```env
# OpenAI
OPENAI_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Database
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Chrome (for NotebookLM)
CHROME_DEBUG_PORT=9222
```

## Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
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
