/**
 * QA-Agent Mock Health API
 * -------------------------------------------------------------
 * Simulates a Welltory-style vitals endpoint that returns a
 * "stress score" derived from RR intervals (the time between
 * heartbeats, in milliseconds) — the same kind of HRV-based
 * calculation a real health app would expose.
 *
 * A calculation bug is intentionally seeded so the QA-Agent
 * workflow has something real to catch. See BUGGY_USER_ID below.
 *
 * Run:  node server.js
 * Test: curl http://localhost:3000/api/vitals/user-001/stress
 *       curl http://localhost:3000/api/vitals/buggy-user/stress
 */

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// This user ID always returns a subtly wrong stress_score,
// simulating a real-world formula drift / rounding bug.
const BUGGY_USER_ID = "buggy-user";

// ---- "Ground truth" calculation (what the API SHOULD compute) ----
function correctStressScore(rrIntervals) {
  const diffs = [];
  for (let i = 0; i < rrIntervals.length - 1; i++) {
    diffs.push(rrIntervals[i + 1] - rrIntervals[i]);
  }
  const meanSquare = diffs.reduce((sum, d) => sum + d * d, 0) / diffs.length;
  const rmssd = Math.sqrt(meanSquare);
  // Lower RMSSD -> higher stress. Clamp to 0-100.
  const score = Math.max(0, Math.min(100, 100 - rmssd * 2));
  return Math.round(score * 10) / 10;
}

// ---- The seeded bug: formula drift (wrong multiplier) ----
function buggyStressScore(rrIntervals) {
  const diffs = [];
  for (let i = 0; i < rrIntervals.length - 1; i++) {
    diffs.push(rrIntervals[i + 1] - rrIntervals[i]);
  }
  const meanSquare = diffs.reduce((sum, d) => sum + d * d, 0) / diffs.length;
  const rmssd = Math.sqrt(meanSquare);
  // BUG: multiplier changed from 2 to 1.4 during a "refactor" —
  // silently inflates every stress score, especially for high-RMSSD users.
  const score = Math.max(0, Math.min(100, 100 - rmssd * 1.4));
  return Math.round(score * 10) / 10;
}

function generateRRIntervals() {
  // 20 beats of realistic RR intervals (ms), with natural variability
  const base = 800 + Math.random() * 200; // resting HR range
  const intervals = [base];
  for (let i = 1; i < 20; i++) {
    const jitter = (Math.random() - 0.5) * 60;
    intervals.push(Math.round(intervals[i - 1] + jitter));
  }
  return intervals;
}

app.get("/api/vitals/:userId/stress", (req, res) => {
  const { userId } = req.params;
  const rrIntervals = generateRRIntervals();

  const stressScore =
    userId === BUGGY_USER_ID
      ? buggyStressScore(rrIntervals)
      : correctStressScore(rrIntervals);

  res.json({
    userId,
    timestamp: new Date().toISOString(),
    rr_intervals: rrIntervals,
    stress_score: stressScore,
    cache_version: "v1.3.2"
  });
});

// Simple health check
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`QA-Agent mock API running on http://localhost:${PORT}`);
  console.log(`  Clean endpoint:  /api/vitals/user-001/stress`);
  console.log(`  Buggy endpoint:  /api/vitals/${BUGGY_USER_ID}/stress`);
});
