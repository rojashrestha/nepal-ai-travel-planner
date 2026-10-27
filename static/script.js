// =====================================================================
// 1. Find the pieces of the page we need
// =====================================================================
const $ = (id) => document.getElementById(id);

const form = $("plan-form");
const fromInput = $("from");
const toInput = $("to");
const daysInput = $("days");
const budgetInput = $("budget");
const messageBox = $("message");
const submitBtn = $("submit-btn");
const loadingBox = $("loading");
const errorBox = $("error");
const resultBox = $("result");
const answerBox = $("answer");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Everything the builder knows about the trip lives in this one object
const trip = {
  travellers: 2,
  mode: "bus",
  interests: [],
};

// Has the user typed in the request box themselves? If so, stop overwriting it.
let requestEdited = false;

// The backend remembers a conversation by its thread_id
let threadId = null;
try { threadId = localStorage.getItem("thread_id"); } catch (e) {}

let lastAnswer = "";


// =====================================================================
// 2. Small helpers
// =====================================================================

// 150000 -> "Rs 1,50,000" (lakh-style grouping, the way rupees are written in Nepal)
const formatRs = (n) => "Rs " + Math.round(n).toLocaleString("en-IN");

// ["a", "b", "c"] -> "a, b and c"
function joinList(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// Change an element's text and give it a short "bump" animation
function setText(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove("bump");
  void el.offsetWidth;            // forces the browser to restart the animation
  el.classList.add("bump");
}


// =====================================================================
// 3. The trip builder: every control calls update()
// =====================================================================
function update() {
  const from = fromInput.value.trim() || "Kathmandu";
  const to = toInput.value.trim() || "somewhere in Nepal";
  const days = Number(daysInput.value);
  const budget = Number(budgetInput.value);
  const people = trip.travellers;

  // Live values next to the controls
  setText($("days-out"), days === 1 ? "1 day" : `${days} days`);
  setText($("budget-out"), formatRs(budget));
  setText($("travellers-out"), String(people));

  // The summary card
  setText($("sum-from"), from);
  setText($("sum-to"), to);
  setText($("sum-days"), days === 1 ? "1 day" : `${days} days`);
  setText($("sum-travellers"), String(people));
  setText($("sum-ppd"), formatRs(budget / (days * people)));
  setText($("sum-mode"), trip.mode === "flight" ? "By air where possible" : "By road");

  // Write the request text, unless the user has edited it by hand
  if (!requestEdited) {
    let text = `${days} day trip from ${from} to ${to} for ${people} ${people === 1 ? "traveller" : "travellers"}, total budget ${formatRs(budget)}.`;
    // the word "fly" makes backend.py also search live flights
    text += trip.mode === "flight"
      ? " I would like to fly where flights are available."
      : " Travel by road (bus or jeep).";
    if (trip.interests.length) text += ` Interests: ${joinList(trip.interests)}.`;
    messageBox.value = text;
  }
}

// Text inputs and sliders: update on every change
[fromInput, toInput, daysInput, budgetInput].forEach((el) => el.addEventListener("input", update));

// Typing a destination highlights the matching chip
toInput.addEventListener("input", () => {
  document.querySelectorAll("#destinations .chip").forEach((chip) => {
    chip.classList.toggle("is-selected", chip.dataset.place.toLowerCase() === toInput.value.trim().toLowerCase());
  });
});

// Destination chips: only one can be selected
document.querySelectorAll("#destinations .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#destinations .chip").forEach((c) => c.classList.remove("is-selected"));
    chip.classList.add("is-selected");
    toInput.value = chip.dataset.place;
    update();
  });
});

// Place photos: fill in the destination, then take the user to the builder
document.querySelectorAll(".place").forEach((place) => {
  place.addEventListener("click", () => {
    toInput.value = place.dataset.place;
    // pretend the user typed it, so the chips and summary update the normal way
    toInput.dispatchEvent(new Event("input"));
    $("planner").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
    // briefly highlight the field that changed
    toInput.classList.remove("flash");
    void toInput.offsetWidth;
    toInput.classList.add("flash");
  });
});

// Interest chips: any number can be selected
document.querySelectorAll("#interests .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const on = chip.classList.toggle("is-selected");
    chip.setAttribute("aria-pressed", on);
    const name = chip.dataset.interest;
    trip.interests = on
      ? [...trip.interests, name]
      : trip.interests.filter((i) => i !== name);
    update();
  });
});

// Travellers stepper (between 1 and 12)
$("minus").addEventListener("click", () => { trip.travellers = Math.max(1, trip.travellers - 1); update(); });
$("plus").addEventListener("click", () => { trip.travellers = Math.min(12, trip.travellers + 1); update(); });

// Road / Flight toggle
document.querySelectorAll(".segment").forEach((seg) => {
  seg.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((s) => {
      s.classList.toggle("is-selected", s === seg);
      s.setAttribute("aria-checked", s === seg);
    });
    trip.mode = seg.dataset.mode;
    update();
  });
});

// If the user types in the request box, keep their words
messageBox.addEventListener("input", () => {
  requestEdited = true;
  $("reset-request").classList.remove("hidden");
});
$("reset-request").addEventListener("click", () => {
  requestEdited = false;
  $("reset-request").classList.add("hidden");
  update();
});

update(); // fill everything in once when the page loads


// =====================================================================
// 4. Send the request to the backend
// =====================================================================
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the browser from reloading the page

  const message = messageBox.value.trim();
  if (!message) {
    showError("Please describe your trip first.");
    return;
  }

  const title = requestEdited
    ? "Your Nepal itinerary"
    : `${fromInput.value.trim() || "Kathmandu"} to ${toInput.value.trim() || "Nepal"}`;

  setLoading(true);

  try {
    // fetch() sends an HTTP request to our FastAPI server (app.py)
    const response = await fetch("/api/travel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, thread_id: threadId }),
    });
    const data = await response.json();

    if (data.error) {
      showError(data.error);
    } else {
      threadId = data.thread_id;
      try { localStorage.setItem("thread_id", threadId); } catch (e) {}
      showAnswer(data.answer, title);
    }
  } catch (err) {
    showError("Could not reach the server. Is it running?");
  } finally {
    setLoading(false);
  }
});

// Start over: reset the builder and forget the conversation
$("new-trip-btn").addEventListener("click", () => {
  threadId = null;
  try { localStorage.removeItem("thread_id"); } catch (e) {}
  form.reset();                   // puts inputs back to their HTML values
  trip.travellers = 2;
  trip.mode = "bus";
  trip.interests = [];
  document.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("is-selected", c.dataset.place === "Pokhara");
    if (c.hasAttribute("aria-pressed")) c.setAttribute("aria-pressed", "false");
  });
  document.querySelectorAll(".segment").forEach((s) => {
    s.classList.toggle("is-selected", s.dataset.mode === "bus");
    s.setAttribute("aria-checked", s.dataset.mode === "bus");
  });
  requestEdited = false;
  $("reset-request").classList.add("hidden");
  resultBox.classList.add("hidden");
  errorBox.classList.add("hidden");
  update();
});

// Copy and print buttons on the result
$("copy-btn").addEventListener("click", async () => {
  const btn = $("copy-btn");
  try {
    await navigator.clipboard.writeText(lastAnswer);
    btn.textContent = "Copied";
  } catch (e) {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => (btn.textContent = "Copy text"), 1500);
});
$("print-btn").addEventListener("click", () => window.print());


// =====================================================================
// 5. Loading, errors and showing the answer
// =====================================================================
let stageTimer = null;

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Planning..." : "Plan my trip";
  loadingBox.classList.toggle("hidden", !isLoading);

  const stages = document.querySelectorAll("#stages li");
  clearInterval(stageTimer);

  if (isLoading) {
    errorBox.classList.add("hidden");
    resultBox.classList.add("hidden");
    loadingBox.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });

    // The stages are timed to roughly match how long each agent takes;
    // the last one stays active until the answer really arrives
    let current = 0;
    const paint = () => stages.forEach((li, i) => {
      li.classList.toggle("is-done", i < current);
      li.classList.toggle("is-active", i === current);
    });
    paint();
    stageTimer = setInterval(() => {
      current = Math.min(current + 1, stages.length - 1);
      paint();
    }, 7000);
  } else {
    stages.forEach((li) => li.classList.remove("is-active", "is-done"));
  }
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
}

// Cleans the AI's text before showing it:
// removes emoji (and the invisible characters that glue emoji together) and long dashes
function cleanAnswer(text) {
  return text
    .replace(/[0-9#*]\uFE0F?\u20E3/gu, "")   // keycap numbers like 1️⃣
    // colourful emoji only; plain symbols like ↔ and → are kept
    .replace(/\p{Extended_Pictographic}\uFE0F|\p{Emoji_Presentation}/gu, "")
    .replace(/[\uFE0F\u200D]/gu, "")
    // long dashes (em dash U+2014, en dash U+2013) become a normal hyphen
    .replace(/[\u2014\u2013]/g, "-");
}

function showAnswer(markdownText, title) {
  const clean = cleanAnswer(markdownText);
  lastAnswer = clean;
  $("result-title").textContent = title;

  // The AI replies in Markdown; marked converts it to HTML and DOMPurify removes anything unsafe
  answerBox.innerHTML = DOMPurify.sanitize(marked.parse(clean));

  buildTableOfContents();
  resultBox.classList.remove("hidden");
  resultBox.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
}


// =====================================================================
// 6. Table of contents for the answer, with the current section highlighted
// =====================================================================
let tocObserver = null;

function buildTableOfContents() {
  const toc = $("toc");
  toc.innerHTML = "";
  if (tocObserver) tocObserver.disconnect();

  const headings = answerBox.querySelectorAll("h2");
  document.querySelector(".toc").classList.toggle("hidden", headings.length < 2);

  headings.forEach((h, i) => {
    // remove "1." style numbering from the link text
    const label = h.textContent.replace(/^\s*\d+[.)]\s*/, "").trim();
    h.id = `section-${i + 1}`;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = label;
    li.appendChild(a);
    toc.appendChild(li);
  });

  // IntersectionObserver tells us when a heading scrolls into the top part of the screen
  tocObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      toc.querySelectorAll("a").forEach((a) => {
        a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  }, { rootMargin: "0px 0px -70% 0px" });
  headings.forEach((h) => tocObserver.observe(h));
}


// =====================================================================
// 7. Page effects: scroll reveal, nav border, hero parallax
// =====================================================================

// Fade elements in the first time they scroll into view
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);   // only animate once
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll(".reveal").forEach((el) => {
  // items in a row (like the four steps) appear one after another
  const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
  el.style.transitionDelay = `${siblings.indexOf(el) * 90}ms`;
  revealObserver.observe(el);
});

// Food and culture strip: arrow buttons scroll it one photo at a time
const strip = $("strip");
const stripPrev = $("strip-prev");
const stripNext = $("strip-next");

function stepSize() {
  const card = strip.querySelector("li");
  const gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
  return card.offsetWidth + gap;
}
// Grey out an arrow when there is nothing more to scroll in that direction
function updateStripButtons() {
  stripPrev.disabled = strip.scrollLeft <= 2;
  stripNext.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2;
}
stripPrev.addEventListener("click", () => strip.scrollBy({ left: -stepSize() }));
stripNext.addEventListener("click", () => strip.scrollBy({ left: stepSize() }));
strip.addEventListener("scroll", updateStripButtons, { passive: true });
window.addEventListener("resize", updateStripButtons);
updateStripButtons();

// Show a thin line under the nav once the page is scrolled
const nav = document.querySelector(".nav");
const heroPhoto = document.querySelector(".parallax");
let ticking = false;

window.addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  // requestAnimationFrame waits for the next screen repaint, so this runs smoothly
  requestAnimationFrame(() => {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 8);
    // The cover photo moves a little slower than the page, which feels like depth
    if (!prefersReducedMotion && heroPhoto && y < 900) {
      heroPhoto.style.transform = `translateY(${-y * 0.08}px)`;
    }
    ticking = false;
  });
}, { passive: true });
