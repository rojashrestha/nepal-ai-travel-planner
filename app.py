from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from backend import run_travel_agent

app = FastAPI(title="Nepal AI Travel Planner")

# Files in /static (CSS, JS) are served as-is at /static/...
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class PlanRequest(BaseModel):
    message: str
    thread_id: str | None = None


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request, "index.html")


# Plain `def` (not async) so FastAPI runs the slow agent call in a thread
# and the server stays responsive while it works
@app.post("/api/plan")
def plan_trip(body: PlanRequest):
    message = body.message.strip()
    if not message:
        return {"error": "Please describe your trip first."}

    try:
        result = run_travel_agent(message, body.thread_id)
    except Exception as e:
        return {"error": f"Something went wrong while planning: {e}"}

    return {"thread_id": result["thread_id"], "answer": result["answer"]}
