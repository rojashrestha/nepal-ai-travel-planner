# Nepal AI Travel Planner

A multi-agent AI travel planner for Nepal. Describe a trip (where, how long, your budget) and four AI agents work together to find transport, hotels and a day-by-day itinerary, with costs in Nepali rupees.

Built with **LangGraph**, **FastAPI** and a plain **HTML, CSS and JavaScript** frontend.

## Features

- **Trip builder:** pick a destination, drag sliders for days and budget, choose travellers, road or flight, and interests. The request is written for you, and you can still edit it.
- **Places to explore:** click a photo (Kathmandu, Bhaktapur, Patan, Mustang, Everest region and more) to start planning a trip there.
- **Four agents** run one after another:
  1. **Transport:** bus and jeep fares, plus live flights when you ask for them
  2. **Hotels:** places to stay, with typical prices in NPR
  3. **Itinerary:** a practical day-by-day plan with sights and entry fees
  4. **Final answer:** everything combined, with a budget breakdown
- **Readable results** with a clickable table of contents, plus Copy and Save as PDF buttons.
- **Conversation memory** stored in PostgreSQL, so each trip has its own thread.

## How it works

```
Browser (templates/ + static/)
   |  POST /api/plan  {"message": "...", "thread_id": "..."}
   v
app.py (FastAPI)
   |  run_travel_agent()
   v
backend.py (LangGraph)
   transport_agent -> hotel_agent -> itinerary_agent -> final_agent
      |                  |                |                 |
   Tavily search      Tavily search    Groq LLM          Groq LLM
   + AviationStack
     (flights only)
```

## Project structure

```
app.py               FastAPI server: serves the website and the /api/plan route
backend.py           LangGraph agents and the PostgreSQL checkpointer
tools/
  tavily_tool.py     Web search for fares and hotels
  flight_tool.py     Live flight lookup (AviationStack)
templates/
  index.html         The web page
static/
  style.css          Design (Himalayan Lake palette)
  script.js          Trip builder, API calls, effects
  images/            Photos used on the site
docs/
  frontend-notes.pdf Beginner notes explaining the frontend
test.py              Run the planner from the terminal
```

## Setup

### 1. Create and activate a Python 3.11 environment

With conda:
```bash
conda create -n travel python=3.11 -y
conda activate travel
```

Or with venv on Windows:
```powershell
python -m venv travel
.\travel\Scripts\Activate.ps1
```

### 2. Install the requirements

```bash
pip install -r requirements.txt
```

### 3. Add your API keys

Create a file called `.env` in the project folder:

```env
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_api_key
AVIATIONSTACK_API_KEY=your_aviationstack_api_key
DATABASE_URL=your_postgresql_connection_url

# Optional
GROQ_MODEL=openai/gpt-oss-120b
DEFAULT_ORIGIN_IATA=KTM
```

| Variable | What it is for | Where to get it |
|---|---|---|
| `GROQ_API_KEY` | The language model that writes the plans | [console.groq.com](https://console.groq.com) |
| `TAVILY_API_KEY` | Web search for fares and hotels | [tavily.com](https://tavily.com) |
| `AVIATIONSTACK_API_KEY` | Live flight data | [aviationstack.com](https://aviationstack.com) |
| `DATABASE_URL` | PostgreSQL database for conversation memory | Any PostgreSQL host, e.g. [Render](https://render.com) |
| `GROQ_MODEL` | Optional: a different Groq chat model | |
| `DEFAULT_ORIGIN_IATA` | Optional: departure airport for flight searches when none is given | An airport code (`KTM`) or a place name |

`.env` is listed in `.gitignore`. **Never commit it, and never paste keys or database URLs into this README.**

## Run

```bash
uvicorn app:app --reload
```

Then open **http://127.0.0.1:8000** in your browser.

Open the site through this address, not by double-clicking `index.html`. The page needs the server for its styles, photos and the planner.

Other useful addresses while the server is running:

- **http://127.0.0.1:8000/docs**: try the API directly in the browser
- **http://127.0.0.1:8000/health**: quick check that the server is up

To plan a trip from the terminal instead:
```bash
python test.py
```

## Notes

- Prices are estimates from web search. Always confirm them before booking.
- The flight API gives schedules but not ticket prices.

## License

[MIT](LICENSE) © 2026 Roja Shrestha
