// server.js
// Node.js backend for Brand Mention & Reputation Tracker
// Run: npm install express socket.io csv-stringify
// then: node server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const SIMULATE_INTERVAL_MS = 2200;
const SPIKE_WINDOW_MS = 60 * 1000;
const SPIKE_THRESHOLD_MULTIPLIER = 3;
const MAX_STORE = 5000;

// ---------- In-memory store ----------
let mentions = []; // newest pushed at end
let mentionTimestamps = [];
let keywords = ['rapidquest','product','launch','issue','update'];
let nextId = 1;
let simulatorRunning = true;

// ---------- Sentiment lexicon (simple but effective for demo) ----------
const SENTIMENT_WORDS = {
  love: 2, great: 2, awesome: 2, amazing: 3, good: 1, nice: 1,
  happy: 1, like: 1, excellent: 3,
  bad: -2, terrible: -3, hate: -3, awful: -3, disappointed: -2,
  issue: -1, problem: -2, bug: -2, stuck: -1, slow: -1, urgent: -1,
  outage: -3, angry: -2, frustrated: -2, fixed: 1, helpful: 2
};

// ---------- Utility helpers ----------
function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s#@]/g, '').split(/\s+/).filter(Boolean);
}
function sentimentScore(text) {
  const tokens = tokenize(text);
  let s = 0;
  tokens.forEach(t => { if (SENTIMENT_WORDS[t]) s += SENTIMENT_WORDS[t]; });
  // clamp
  if (s > 6) s = 6;
  if (s < -6) s = -6;
  return +(s / 6).toFixed(3);
}
function sentimentLabel(score) {
  if (score >= 0.4) return 'positive';
  if (score <= -0.4) return 'negative';
  return 'neutral';
}
function termFreqVector(tokens) {
  const tf = {};
  tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
  return tf;
}
function dot(a,b){ let s=0; for(const k in a) if (b[k]) s+=a[k]*b[k]; return s; }
function magnitude(a){ let s=0; for(const k in a) s+=a[k]*a[k]; return Math.sqrt(s); }
function cosine(a,b){ const d=dot(a,b); const m=magnitude(a)*magnitude(b); return m===0?0:d/m; }

// topic clustering - simple agglomerative on small batch for demo
function clusterTopics(list){
  if (!list || !list.length) return [];
  const vecs = list.map(m => ({ id: m.id, vec: termFreqVector(tokenize(m.text)) }));
  const clusters = [];
  vecs.forEach(item => {
    let placed = false;
    for (const c of clusters) {
      const avgSim = c.items.reduce((acc, it) => acc + cosine(item.vec, it.vec), 0) / c.items.length;
      if (avgSim > 0.32) { c.items.push(item); placed = true; break; }
    }
    if (!placed) clusters.push({ items: [item] });
  });
  return clusters.map((c, idx) => {
    const combined = {};
    c.items.forEach(it => { for(const k in it.vec) combined[k] = (combined[k]||0) + it.vec[k]; });
    const top = Object.entries(combined).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]).filter(Boolean);
    return { id: 'topic_'+idx, label: top.join(', ') || 'misc', count: c.items.length, items: c.items.map(i=>i.id) };
  });
}

// ---------- Simulated sources ----------
const SOURCES = [
  { platform: 'twitter', source: 'Twitter' },
  { platform: 'reddit', source: 'Reddit' },
  { platform: 'news', source: 'News' },
  { platform: 'blog', source: 'Blog' },
  { platform: 'forum', source: 'Forum' }
];
const SAMPLE_TEXTS = [
  "Loving the new RapidQuest update — it's awesome and fast!",
  "RapidQuest rollout caused a major outage, customers are angry and frustrated",
  "Anyone else seeing issues after the product launch? app is slow",
  "Great pricing on the new plan, looks competitive.",
  "I hate how the onboarding works — terrible UX.",
  "Support fixed my issue quickly, nice response time!",
  "New campaign looks amazing — great creatives!",
  "There is a bug in the signup flow, keeps failing for some users",
  "Release notes didn't mention the breaking change, disappointed",
  "Amazing features shipped in this update, love it!"
];

// ---------- Mention creation & ingestion ----------
function createMention(trackedKeywords){
  const src = SOURCES[Math.floor(Math.random()*SOURCES.length)];
  let text = SAMPLE_TEXTS[Math.floor(Math.random()*SAMPLE_TEXTS.length)];
  if (Math.random() < 0.75 && trackedKeywords && trackedKeywords.length) {
    const kw = trackedKeywords[Math.floor(Math.random()*trackedKeywords.length)];
    if (!text.toLowerCase().includes(kw.toLowerCase())) {
      text = Math.random() < 0.5 ? `${kw} - ${text}` : `${text} #${kw}`;
    }
  }
  const ts = Date.now();
  const score = sentimentScore(text);
  const label = sentimentLabel(score);
  const m = { id: String(nextId++), source: src.source, platform: src.platform, text, ts, sentimentScore: score, sentimentLabel: label };
  return m;
}
function ingest(m){
  mentions.push(m);
  mentionTimestamps.push(m.ts);
  // trim
  if (mentions.length > MAX_STORE) mentions = mentions.slice(-MAX_STORE);
  if (mentionTimestamps.length > MAX_STORE) mentionTimestamps = mentionTimestamps.slice(-MAX_STORE);
  io.emit('new_mention', m);
  // spike detection
  if (detectSpike()) {
    io.emit('spike_alert', { message: 'Spike detected in mentions', ts: Date.now() });
  }
}

// ---------- Spike detection ----------
function detectSpike(){
  const now = Date.now();
  const windowStart = now - SPIKE_WINDOW_MS;
  const currentCount = mentionTimestamps.filter(t => t >= windowStart).length;
  const prevWindowStart = now - (6 * SPIKE_WINDOW_MS);
  const prevWindows = mentionTimestamps.filter(t => t >= prevWindowStart && t < windowStart);
  const prevAvg = (prevWindows.length / 5) || 0;
  if (prevAvg === 0) return false;
  return currentCount >= Math.max(3, SPIKE_THRESHOLD_MULTIPLIER * prevAvg);
}

// seed
for (let i=0;i<40;i++){
  const m = createMention(keywords);
  m.ts -= (40-i)*1200;
  ingest(m);
}

// simulator
setInterval(()=>{
  if (!simulatorRunning) return;
  const m = createMention(keywords);
  ingest(m);
}, SIMULATE_INTERVAL_MS);

// ---------- REST endpoints ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve index.html (frontend) from same folder
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// mentions list + topics
app.get('/api/mentions', (req,res) => {
  const q = (req.query.q || '').toLowerCase();
  const filtered = q ? mentions.filter(m => m.text.toLowerCase().includes(q)) : mentions;
  // cluster top N (most recent)
  const topics = clusterTopics(filtered.slice(-30));
  res.json({ ok: true, total: filtered.length, mentions: filtered.slice().reverse().slice(0,500), topics });
});

// analytics
app.get('/api/analytics', (req,res) => {
  const total = mentions.length;
  const bySent = mentions.reduce((acc,m)=>{ acc[m.sentimentLabel] = (acc[m.sentimentLabel]||0) + 1; return acc; }, {});
  res.json({ ok: true, total, bySent, lastUpdated: Date.now() });
});

// update keywords (POST)
app.post('/api/keywords', (req,res) => {
  const body = req.body;
  if (!body || !body.keywords) return res.status(400).json({ ok:false, message: 'keywords required' });
  const arr = Array.isArray(body.keywords) ? body.keywords : String(body.keywords).split(',').map(s=>s.trim()).filter(Boolean);
  keywords = arr;
  io.emit('keywordsUpdated', keywords);
  return res.json({ ok:true, keywords });
});

// simulator control
app.post('/api/simulator', (req,res) => {
  const action = req.body && req.body.action;
  if (action === 'stop') simulatorRunning = false;
  if (action === 'start') simulatorRunning = true;
  return res.json({ ok:true, simulatorRunning });
});

// CSV export of recent mentions
app.get('/api/export.csv', (req,res) => {
  const recent = mentions.slice(-1000).map(m => ({
    id: m.id, ts: new Date(m.ts).toISOString(), source: m.source, platform: m.platform,
    sentimentLabel: m.sentimentLabel, sentimentScore: m.sentimentScore, text: m.text
  }));
  const csv = stringify(recent, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=mentions_export.csv');
  res.send(csv);
});

// simple health
app.get('/health', (req,res) => res.json({ ok: true, uptime: process.uptime() }));

// ---------- Socket.IO ----------
io.on('connection', socket => {
  console.log('client connected', socket.id);
  socket.emit('init', { mentions: mentions.slice().reverse().slice(0,500), keywords, analytics: { total: mentions.length } });
  socket.on('updateKeywords', arr => {
    if (Array.isArray(arr)) {
      keywords = arr.map(s=>s.trim()).filter(Boolean);
      io.emit('keywordsUpdated', keywords);
    }
  });
  socket.on('toggleSimulator', (val) => {
    simulatorRunning = !!val;
    socket.emit('simulatorState', simulatorRunning);
  });
});

// ---------- Start server ----------
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
