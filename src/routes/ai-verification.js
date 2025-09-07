const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { authenticateToken } = require('../middleware/auth');
const { storage } = require('../config/firebase');
const router = express.Router();

// Configure OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer to use in-memory storage (same pattern as profile-image)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  }
});

// Utility: determine actual winner from score + players
function getWinnerFromScore(score, players) {
  const scoreMatch = score?.match(/(\d+)[-:](\d+)/);
  if (!scoreMatch || !players || players.length < 2) return null;

  const score1 = parseInt(scoreMatch[1]);
  const score2 = parseInt(scoreMatch[2]);
  const [p1, p2] = players.map(p => p.split(':')[0].trim());

  if (score1 > score2) return p1;
  if (score2 > score1) return p2;
  return null; // tie or invalid
}

// Utility: fuzzy match myTeam vs winner
function didIWin(myTeam, winner) {
  if (!myTeam || !winner) return false;
  const myTeamLower = myTeam.toLowerCase().trim();
  const winnerLower = winner.toLowerCase().trim();
  return (
    myTeamLower === winnerLower ||
    winnerLower.includes(myTeamLower) ||
    myTeamLower.includes(winnerLower)
  );
}

// POST /analyze-scoreboard
router.post('/analyze-scoreboard', authenticateToken, upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No screenshot uploaded" });

    const { myTeam, challengeId, gameType } = req.body;
    const imageBase64 = Buffer.from(req.file.buffer).toString('base64');

    let analysisPrompt = `Analyze this gaming scoreboard screenshot.
    Return JSON with:
    {
      "winner": "<winner>",
      "score": "<e.g. 15-10>",
      "players": ["Player1:score", "Player2:score"],
      "gameType": "<detected>",
      "confidence": "<0-1>"
    }`;

    if (gameType) analysisPrompt += `\n\nThis is a ${gameType} game.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a scoreboard analyzer. Respond ONLY in valid JSON." },
        { role: "user", content: [
          { type: "text", text: analysisPrompt },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]}
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const iWin = didIWin(myTeam, result.winner);

    // no temp file to clean up (memory storage)

    res.json({
      success: true,
      data: { ...result, iWin, analyzedAt: new Date().toISOString(), challengeId }
    });
  } catch (err) {
    console.error('❌ AI analysis error:', err);
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ success: false, error: "AI analysis failed." });
  }
});

// POST /verify-challenge-proof
router.post('/verify-challenge-proof', authenticateToken, upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No proof screenshot uploaded" });

    const { challengeId, myTeam, gameType, proofDescription } = req.body;
    if (!challengeId || !myTeam) return res.status(400).json({ success: false, error: "Challenge ID and myTeam are required" });

    const imageBase64 = Buffer.from(req.file.buffer).toString('base64');
    let storageImageUrl = null;
    // Persist proof screenshot to Firebase Storage for auditability
    if (!storage) {
      return res.status(500).json({ success: false, message: 'File storage service not available' });
    }
    try {
      const bucket = storage.bucket();
      const ext = (req.file.originalname || '').split('.').pop();
      const safeExt = ext ? `.${ext}` : '.png';
      const path = `proofs/${req.user.uid}/${challengeId}/${Date.now()}${safeExt}`;
      const fileRef = bucket.file(path);
      await fileRef.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype || 'image/png',
          metadata: {
            uploadedBy: req.user.uid,
            originalName: req.file.originalname,
            type: 'challenge-proof',
            challengeId,
            uploadedAt: new Date().toISOString()
          }
        }
      });
      const [signedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 365 });
      storageImageUrl = signedUrl;
    } catch (e) {
      console.error('⚠️ Failed to persist proof image to Storage:', e?.message || e);
      return res.status(500).json({ success: false, message: 'Failed to upload proof image' });
    }

    const analysisPrompt = `Analyze this challenge proof screenshot.
    Game Type: ${gameType || 'Unknown'}
    Player: ${myTeam}
    Description: ${proofDescription || 'None'}

    Return JSON with:
    {
      "winner": "<winner>",
      "score": "<6-7>",
      "players": ["Player1:score", "Player2:score"],
      "gameType": "<detected>",
      "confidence": "<0-1>",
      "verificationResult": "<verified/needs_review/rejected>",
      "reasoning": "<short explanation>",
      "evidenceQuality": "<high/medium/low>",
      "suggestions": ["..."]
    }
    - CRITICAL: winner must be the player/team with the higher score.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a challenge verification expert. Respond ONLY in valid JSON." },
        { role: "user", content: [
          { type: "text", text: analysisPrompt },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]}
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });

    const result = JSON.parse(response.choices[0].message.content);

    // ✅ Score-based correction
    const scoreWinner = getWinnerFromScore(result.score, result.players);
    let correctedWinner = result.winner;
    let contradictionDetected = false;

    if (scoreWinner && result.winner && scoreWinner.toLowerCase() !== result.winner.toLowerCase()) {
      contradictionDetected = true;
      correctedWinner = scoreWinner;
      result.originalWinner = result.winner;
      result.correctedWinner = scoreWinner;
      result.winner = scoreWinner;
      console.log(`⚠️ AI contradiction fixed: winner corrected to ${scoreWinner}`);
    }

    const iWin = didIWin(myTeam, result.winner);

    // no temp file to clean up (memory storage)

    res.json({
      success: true,
      data: {
        ...result,
        iWin,
        analyzedAt: new Date().toISOString(),
        challengeId,
        myTeam,
        contradictionDetected,
        proofImageUrl: storageImageUrl
      }
    });
  } catch (err) {
    console.error('❌ AI verification error:', err);
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ success: false, error: "AI verification failed." });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'AI verification service running', timestamp: new Date().toISOString(), openaiConfigured: !!process.env.OPENAI_API_KEY });
});

module.exports = router;
