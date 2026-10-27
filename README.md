# CareVision AI
AI-assisted telemedicine platform: patient, doctor and admin portals, 3 AI agents (free open-source models via Ollama, no API key), AI Health Reports and best-doctor matching.
Node.js, Express, MongoDB, vanilla JS. Full guide: **GUIDE.md**.

    cd backend && npm install && cp .env.example .env     # set MONGO_URI, JWT_SECRET, ADMIN_PASSWORD
    npm run seed && npm run dev                            # http://localhost:5000

    # AI (free, local):  install Ollama, then
    ollama pull llama3.2:3b && ollama pull gemma3:4b
    npm run ai:check                                       # must say "All good"
