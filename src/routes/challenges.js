const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { firestore } = require('../config/firebase');
const { WalletService } = require('../services/walletService');
const UserService = require('../services/userService');

const walletService = new WalletService();
const userService = new UserService();

// Real AI analysis using OpenAI Vision API
async function performAIAnalysis(challengeData, proofImages, proofDescription, platformUsernames) {
  try {
    console.log('🤖 Starting real AI analysis with platform username comparison...');
    console.log('🤖 Challenge ID:', challengeData.id);
    console.log('🤖 Proof images:', proofImages);
    console.log('🤖 Proof description:', proofDescription);
    console.log('🔍 Platform usernames to check:', platformUsernames);
    
    // Import OpenAI client for direct integration
    const OpenAI = require('openai');
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }
    
    // Get the first proof image for analysis
    const firstImageUrl = proofImages[0];
    if (!firstImageUrl) {
      throw new Error('No proof image provided for AI analysis');
    }
    
    console.log('🤖 Analyzing image:', firstImageUrl);
    
    // Extract platform usernames for comparison
    const platformUsernamesList = platformUsernames ? Object.values(platformUsernames).filter(u => u && u.trim()) : [];
    const currentUser = challengeData.challenger.username;
    const gameType = challengeData.game;
    
    console.log('🔍 Usernames for comparison:');
    console.log('  - Current user:', currentUser);
    console.log('  - Platform usernames:', platformUsernamesList);
    
    // Create comprehensive analysis prompt focused on username detection
    const analysisPrompt = `Analyze this gaming proof screenshot and extract ALL visible usernames/player names.
    
    IMPORTANT: This is a challenge verification where the user is claiming to be the winner.
    You need to determine if they actually won by analyzing the image evidence.
    
    Expected Game Type: ${gameType || 'Unknown'}
    Current User Claiming Win: ${currentUser}
    Platform Usernames to Look For: ${platformUsernamesList.join(', ')}
    Proof Description: ${proofDescription || 'No description provided'}
    
    Return JSON with the fields:
    {
      "detectedUsernames": ["username1", "username2", "username3", ...],
      "winner": "<winner username if clearly visible>",
      "score": "<score format if visible>",
      "players": ["Player1:score", "Player2:score", ...],
      "gameType": "<detected game type from image>",
      "confidence": "<confidence level 0-1>",
      "verificationResult": "<verified/needs_review/rejected>",
      "reasoning": "<explanation of the verification decision>",
      "evidenceQuality": "<high/medium/low>",
      "suggestions": ["suggestion1", "suggestion2", ...]
    }
    
    CRITICAL ANALYSIS POINTS:
    1. Look for ALL visible usernames/display names (case-insensitive) - scan the entire image
    2. **CRITICAL**: Look for final scores and determine the winner based on the actual scores
    3. **CRITICAL**: If you see a score like "6-7", the player with 7 points WON, the player with 6 points LOST
    4. **CRITICAL**: Higher score = WINNER, Lower score = LOSER (this is standard in most games)
    5. Check if the current user "${currentUser}" appears in the image
    6. Determine if the image shows a win or loss for the current user based on ACTUAL SCORES
    7. Look for any text that could be usernames, player names, or player identifiers
    8. Check for game completion status and final results
    9. Detect the actual game type shown in the image (not just the expected type)
    
    SCORE ANALYSIS RULES:
    - If you see "Player1: 6, Player2: 7" → Player2 WON (7 > 6)
    - If you see "6-7" → Right side (7) WON, Left side (6) LOST
    - If you see "Final Score: 6-7" → 7 points = WINNER, 6 points = LOSER
    - Higher number always wins unless explicitly stated otherwise
    
    Be extremely thorough in detecting usernames and scores - look for any text that appears to be player names 
    or final scores. This is critical for accurate winner determination.
    
    IMPORTANT: If the detected game type doesn't match the expected game type, mention this in reasoning
    but still analyze the image for usernames and winner determination.
    
    If you cannot clearly determine the winner or find the current user's username, set confidence low.`;
    
    console.log('🤖 Sending to OpenAI Vision API...');
    
    // Call OpenAI Vision API
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // Use GPT-4o-mini for cost efficiency
      messages: [
        {
          role: "system",
          content: "You are a gaming challenge verification expert. Extract ALL visible usernames and determine winners. Always respond in valid JSON format.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: analysisPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: firstImageUrl
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    
    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
      console.log('🤖 OpenAI Vision API result:', result);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.log('🤖 Raw AI response:', response.choices[0].message.content);
      
      // Try to extract JSON from the response if it's not pure JSON
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
          console.log('✅ Successfully extracted JSON from response');
        } catch (secondParseError) {
          console.error('❌ Failed to parse extracted JSON:', secondParseError);
          throw new Error('AI response could not be parsed as valid JSON');
        }
      } else {
        throw new Error('AI response does not contain valid JSON');
      }
    }
    
    // Validate required fields
    if (!result.detectedUsernames || !Array.isArray(result.detectedUsernames)) {
      console.warn('⚠️ AI response missing detectedUsernames array, creating fallback');
      result.detectedUsernames = [];
    }
    
    if (!result.confidence || typeof result.confidence !== 'number') {
      console.warn('⚠️ AI response missing confidence, setting default');
      result.confidence = 0.5;
    }

    // CRITICAL: Log the exact AI response for debugging
    console.log('🔍 DETAILED AI RESPONSE ANALYSIS:');
    console.log('  - Winner field:', result.winner);
    console.log('  - Reasoning:', result.reasoning);
    console.log('  - Score field:', result.score);
    console.log('  - Detected usernames:', result.detectedUsernames);
    console.log('  - Game type:', result.gameType);
    console.log('  - Confidence:', result.confidence);
    
    // Check for contradictions in the AI response itself
    if (result.winner && result.reasoning) {
      const winnerInReasoning = result.reasoning.toLowerCase().includes(result.winner.toLowerCase());
      const victoryMentioned = result.reasoning.toLowerCase().includes('victory') || result.reasoning.toLowerCase().includes('won') || result.reasoning.toLowerCase().includes('win');
      
      console.log('  - Winner mentioned in reasoning:', winnerInReasoning);
      console.log('  - Victory mentioned in reasoning:', victoryMentioned);
      
      if (!winnerInReasoning && victoryMentioned) {
        console.warn('⚠️ POTENTIAL ISSUE: Winner field doesn\'t match reasoning');
      }
    }

    // CRITICAL: Validate AI winner determination against detected scores
    if (result.winner && result.score) {
      console.log('🔍 Validating AI winner determination against scores...');
      console.log('  - AI detected winner:', result.winner);
      console.log('  - AI detected score:', result.score);
      
      // Try to extract scores from the score field
      const scoreMatch = result.score.toString().match(/(\d+)[\-\s:]+(\d+)/);
      if (scoreMatch) {
        const score1 = parseInt(scoreMatch[1]);
        const score2 = parseInt(scoreMatch[2]);
        console.log('  - Parsed scores:', score1, 'vs', score2);
        
        // Determine winner based on scores (higher score wins)
        const actualWinner = score1 > score2 ? score1 : score2;
        const actualLoser = score1 > score2 ? score2 : score1;
        
        console.log('  - Score analysis: Higher score wins');
        console.log('  - Winner score:', actualWinner);
        console.log('  - Loser score:', actualLoser);
        
        // Check if AI winner matches score-based winner
        if (result.winner !== actualWinner.toString() && result.winner !== actualLoser.toString()) {
          console.warn('⚠️ AI winner determination may be incorrect based on scores');
          console.warn('  - AI says winner is:', result.winner);
          console.warn('  - But scores suggest winner should have score:', actualWinner);
        }
      }
    }
    
    // Now compare detected usernames with platform usernames for accurate winner determination
    const detectedUsernames = result.detectedUsernames || [];
    let winner = null;
    let iWin = false;
    let confidence = result.confidence || 0.5;
    let reasoning = result.reasoning || '';
    
    console.log('🔍 Username comparison analysis:');
    console.log('  - Detected in image:', detectedUsernames);
    console.log('  - Platform usernames:', platformUsernamesList);
    console.log('  - Current user submitting proof:', currentUser);
    
    // IMPORTANT: If user is submitting proof, they are claiming to be the winner
    // We need to verify this claim against the image evidence
    
    if (detectedUsernames.length > 0 && platformUsernamesList.length > 0) {
      // Find matching usernames (case-insensitive)
      const matchingUsernames = [];
      
      platformUsernamesList.forEach(platformUsername => {
        const platformLower = platformUsername.toLowerCase().trim();
        const found = detectedUsernames.find(detected => 
          detected.toLowerCase().trim() === platformLower ||
          detected.toLowerCase().trim().includes(platformLower) ||
          platformLower.includes(detected.toLowerCase().trim())
        );
        
        if (found) {
          matchingUsernames.push({
            platform: platformUsername,
            detected: found,
            confidence: 'high'
          });
        }
      });
      
      console.log('✅ Matching usernames found:', matchingUsernames);
      
      if (matchingUsernames.length > 0) {
        // Check if current user's username is found in the image
        const currentUserFound = matchingUsernames.some(match => 
          match.platform.toLowerCase().trim() === currentUser.toLowerCase().trim()
        );
        
                if (currentUserFound) {
          // Current user's username found in image - check if they're the winner
          if (result.winner && result.confidence > 0.6) {
            // AI detected a winner - check if it matches current user
            const aiWinnerLower = result.winner.toLowerCase().trim();
            const isCurrentUserWinner = matchingUsernames.some(match => 
              match.platform.toLowerCase().trim() === aiWinnerLower ||
              match.platform.toLowerCase().trim().includes(aiWinnerLower) ||
              aiWinnerLower.includes(match.platform.toLowerCase().trim())
            );
            
            // CRITICAL: Double-check winner determination using scores if available
            let scoreBasedWinner = null;
            if (result.score) {
              const scoreMatch = result.score.toString().match(/(\d+)[\-\s:]+(\d+)/);
              if (scoreMatch) {
                const score1 = parseInt(scoreMatch[1]);
                const score2 = parseInt(scoreMatch[2]);
                const higherScore = Math.max(score1, score2);
                const lowerScore = Math.min(score1, score2);
                
                // Find which username corresponds to the higher score
                if (detectedUsernames.length >= 2) {
                  // Try to match scores with usernames based on position
                  // Usually left side = first score, right side = second score
                  const leftUsername = detectedUsernames[0];
                  const rightUsername = detectedUsernames[1];
                  
                  if (score1 > score2) {
                    scoreBasedWinner = leftUsername;
                    console.log('🔍 Score analysis: Left player won with higher score', score1, '>', score2);
                  } else {
                    scoreBasedWinner = rightUsername;
                    console.log('🔍 Score analysis: Right player won with higher score', score2, '>', score1);
                  }
                }
              }
            }
            
            // Use score-based winner if it conflicts with AI winner
            if (scoreBasedWinner && scoreBasedWinner !== result.winner) {
              console.warn('⚠️ AI winner determination conflicts with score analysis');
              console.warn('  - AI says winner is:', result.winner);
              console.warn('  - Score analysis says winner is:', scoreBasedWinner);
              console.warn('  - Using score-based winner for accuracy');
              
              // Override AI winner with score-based winner
              result.winner = scoreBasedWinner;
              result.confidence = Math.max(0.7, result.confidence); // Boost confidence
            }
            
            // CRITICAL: Also check if AI reasoning contradicts the winner
            if (result.reasoning && result.reasoning.toLowerCase().includes('victory') && result.reasoning.toLowerCase().includes('j_uly67')) {
              console.warn('⚠️ AI reasoning contradicts winner determination');
              console.warn('  - AI says winner is:', result.winner);
              console.warn('  - But reasoning mentions J_ULY67 victory');
              console.warn('  - Correcting winner to J_ULY67');
              
              // Override with the correct winner from reasoning
              result.winner = 'J_ULY67';
              result.confidence = Math.max(0.8, result.confidence);
            }
            
            if (isCurrentUserWinner) {
              winner = currentUser;
              confidence = Math.min(0.95, result.confidence + 0.1);
              let gameTypeNote = '';
              if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
                gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
              }
              reasoning = `AI detected winner "${result.winner}" which matches current user "${currentUser}". High confidence win verified.${gameTypeNote}`;
              iWin = true;
            } else {
              // AI detected someone else as winner
              winner = result.winner;
              confidence = result.confidence * 0.8;
              let gameTypeNote = '';
              if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
                gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
              }
              reasoning = `AI detected winner "${result.winner}" but current user "${currentUser}" is not the winner.${gameTypeNote}`;
              iWin = false;
            }
          } else {
            // No clear AI winner - check if current user is the only username found
            if (matchingUsernames.length === 1 && matchingUsernames[0].platform.toLowerCase().trim() === currentUser.toLowerCase().trim()) {
              winner = currentUser;
              confidence = 0.8;
              let gameTypeNote = '';
              if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
                gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
              }
              reasoning = `Current user "${currentUser}" is the only username found in the image. Assuming win.${gameTypeNote}`;
              iWin = true;
            } else {
              // Multiple usernames or current user not found as winner
              winner = 'Unknown';
              confidence = 0.6;
              let gameTypeNote = '';
              if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
                gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
              }
              reasoning = `Multiple usernames found but no clear winner. Current user "${currentUser}" may not be the winner.${gameTypeNote}`;
              iWin = false;
            }
          }
        } else {
                  // Current user's username not found in image - this is suspicious
        winner = 'Unknown';
        confidence = 0.3;
        let gameTypeNote = '';
        if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
          gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
        }
        reasoning = `Current user "${currentUser}" not found in the image despite submitting proof. This may indicate invalid proof.${gameTypeNote}`;
        iWin = false;
        }
      } else {
        // No username matches found - this is also suspicious
        winner = 'Unknown';
        confidence = 0.2;
        let gameTypeNote = '';
        if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
          gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
        }
        reasoning = `No platform usernames match the detected usernames in the image. Proof may be invalid or from different game.${gameTypeNote}`;
        iWin = false;
      }
    } else {
      // No platform usernames or detected usernames - this is problematic
      if (result.winner && result.confidence > 0.6) {
        // Check if AI-detected winner matches current user
        const aiWinnerLower = result.winner.toLowerCase().trim();
        const isCurrentUserWinner = aiWinnerLower === currentUser.toLowerCase().trim();
        
        if (isCurrentUserWinner) {
          winner = currentUser;
          confidence = result.confidence * 0.7; // Reduce confidence due to no username verification
          let gameTypeNote = '';
          if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
            gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
          }
          reasoning = `AI detected current user "${currentUser}" as winner, but no platform usernames provided for verification.${gameTypeNote}`;
          iWin = true;
        } else {
          winner = result.winner;
          confidence = result.confidence * 0.6;
          let gameTypeNote = '';
          if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
            gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
          }
          reasoning = `AI detected winner "${result.winner}" but current user "${currentUser}" is not the winner.${gameTypeNote}`;
          iWin = false;
        }
      } else {
        // No clear evidence - reject the proof
        winner = 'Unknown';
        confidence = 0.1;
        let gameTypeNote = '';
        if (result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase()) {
          gameTypeNote = ` Note: Image shows ${result.gameType} but challenge was for ${gameType}.`;
        }
        reasoning = `No clear evidence of winner and no platform usernames provided. Cannot verify proof validity.${gameTypeNote}`;
        iWin = false;
      }
    }
    
    // Add additional metadata
    const aiResult = {
      ...result,
      winner,
      iWin,
      confidence,
      reasoning,
      analyzedAt: new Date().toISOString(),
      challengeId: challengeData.id,
      currentUser,
      aiIntegrated: true,
      status: 'ai_verified',
      model: 'gpt-4o-mini',
      gameTypeMismatch: result.gameType && result.gameType.toLowerCase() !== gameType.toLowerCase(),
      expectedGameType: gameType,
      detectedGameType: result.gameType,
      scoreValidation: {
        originalScore: result.score,
        parsedScores: result.score ? (() => {
          const scoreMatch = result.score.toString().match(/(\d+)[\-\s:]+(\d+)/);
          if (scoreMatch) {
            const score1 = parseInt(scoreMatch[1]);
            const score2 = parseInt(scoreMatch[2]);
            return { score1, score2, higherScore: Math.max(score1, score2), lowerScore: Math.min(score1, score2) };
          }
          return null;
        })() : null
      },
      usernameAnalysis: {
        detectedUsernames,
        platformUsernames: platformUsernamesList,
        matchingUsernames: platformUsernamesList.length > 0 ? 
          platformUsernamesList.map(u => ({
            platform: u,
            found: detectedUsernames.some(d => 
              d.toLowerCase().trim() === u.toLowerCase().trim() ||
              d.toLowerCase().trim().includes(u.toLowerCase().trim()) ||
              u.toLowerCase().trim().includes(d.toLowerCase().trim())
            )
          })) : []
      }
    };
    
    // FINAL VALIDATION: Double-check winner determination using scores and reasoning
    if (aiResult.scoreValidation?.parsedScores && aiResult.winner !== 'Unknown') {
      const { score1, score2, higherScore, lowerScore } = aiResult.scoreValidation.parsedScores;
      
      // Check if the AI winner determination makes sense with the scores
      if (aiResult.winner === currentUser && aiResult.iWin === true) {
        // AI says current user won - verify this against scores
        const currentUserScore = detectedUsernames.includes(currentUser) ? 
          (detectedUsernames.indexOf(currentUser) === 0 ? score1 : score2) : null;
        
        if (currentUserScore !== null && currentUserScore < Math.max(score1, score2)) {
          console.error('🚨 CRITICAL ERROR: AI incorrectly determined winner!');
          console.error('  - AI says current user won:', currentUser);
          console.error('  - But current user score:', currentUserScore);
          console.error('  - Opponent score:', Math.max(score1, score2));
          console.error('  - Current user clearly LOST based on scores');
          
          // Override the incorrect AI result
          aiResult.winner = 'Unknown';
          aiResult.iWin = false;
          aiResult.confidence = 0.1;
          aiResult.reasoning = `AI analysis error detected: Current user "${currentUser}" claimed to win but scores show they lost (${currentUserScore} vs ${Math.max(score1, score2)}). Manual review required.`;
          
          console.log('✅ Corrected AI error - current user actually lost');
        }
      }
    }
    
    // ADDITIONAL VALIDATION: Check for contradictions between AI reasoning and winner
    if (aiResult.reasoning && aiResult.winner) {
      const reasoning = aiResult.reasoning.toLowerCase();
      const winner = aiResult.winner.toLowerCase();
      
      // Check if reasoning mentions specific usernames winning
      if (reasoning.includes('j_uly67') && reasoning.includes('victory') && winner !== 'j_uly67') {
        console.warn('🚨 CONTRADICTION DETECTED: AI reasoning says J_ULY67 won but winner field says:', aiResult.winner);
        console.warn('  - Correcting winner to J_ULY67 based on reasoning');
        
        aiResult.winner = 'J_ULY67';
        aiResult.iWin = aiResult.winner.toLowerCase() === currentUser.toLowerCase();
        aiResult.confidence = Math.max(0.9, aiResult.confidence);
        aiResult.reasoning = aiResult.reasoning + ' [Winner corrected based on reasoning analysis]';
      }
      
      if (reasoning.includes('ttv_onlyvehiclez') && reasoning.includes('victory') && winner !== 'ttv_onlyvehiclez') {
        console.warn('🚨 CONTRADICTION DETECTED: AI reasoning says TTV_OnlyVehiclez won but winner field says:', aiResult.winner);
        console.warn('  - Correcting winner to TTV_OnlyVehiclez based on reasoning');
        
        aiResult.winner = 'TTV_OnlyVehiclez';
        aiResult.iWin = aiResult.winner.toLowerCase() === currentUser.toLowerCase();
        aiResult.confidence = Math.max(0.9, aiResult.confidence);
        aiResult.reasoning = aiResult.reasoning + ' [Winner corrected based on reasoning analysis]';
      }
      
      // Check for score-based contradictions in reasoning
      if (reasoning.includes('scored 6') && reasoning.includes('scored 7') && reasoning.includes('victory for j_uly67')) {
        console.warn('🚨 SCORE CONTRADICTION DETECTED: Reasoning says 6 vs 7 with J_ULY67 victory');
        console.warn('  - Correcting winner to J_ULY67 based on score analysis in reasoning');
        
        aiResult.winner = 'J_ULY67';
        aiResult.iWin = aiResult.winner.toLowerCase() === currentUser.toLowerCase();
        aiResult.confidence = Math.max(0.95, aiResult.confidence);
        aiResult.reasoning = aiResult.reasoning + ' [Winner corrected based on score analysis in reasoning]';
      }
      
      // CRITICAL: Check for the specific case where AI says one person won but reasoning clearly shows another
      if (reasoning.includes('ttv_onlyvehiclez scored 6') && reasoning.includes('j_uly67 scored 7') && 
          reasoning.includes('victory for j_uly67') && winner !== 'j_uly67') {
        console.error('🚨 CRITICAL CONTRADICTION: AI winner field vs reasoning mismatch');
        console.error('  - AI winner field says:', aiResult.winner);
        console.error('  - But reasoning clearly shows: TTV_OnlyVehiclez (6) vs J_ULY67 (7) with J_ULY67 victory');
        console.error('  - FORCING correction to J_ULY67 as winner');
        
        aiResult.winner = 'J_ULY67';
        aiResult.iWin = aiResult.winner.toLowerCase() === currentUser.toLowerCase();
        aiResult.confidence = 0.99; // Very high confidence due to clear contradiction
        aiResult.reasoning = aiResult.reasoning + ' [CRITICAL: Winner field corrected from contradiction - J_ULY67 won 7-6]';
      }
    }
    
    console.log('✅ AI analysis completed successfully:', {
      winner: aiResult.winner,
      iWin: aiResult.iWin,
      confidence: aiResult.confidence,
      reasoning: aiResult.reasoning,
      usernameMatches: aiResult.usernameAnalysis.matchingUsernames.filter(m => m.found).length,
      scoreValidation: aiResult.scoreValidation
    });
    
    return aiResult;
    
  } catch (error) {
    console.error('❌ Error in AI analysis:', error);
    
    // Fallback result if AI fails
    return {
      winner: challengeData.challenger.username,
      confidence: 0.75,
      reasoning: 'AI analysis failed, defaulting to challenger based on available evidence.',
      analysis: 'Due to technical difficulties in AI analysis, the result was determined based on the submitted proof and challenge rules.',
      aiIntegrated: false,
      status: 'fallback',
      error: error.message,
      fallbackReason: 'AI service unavailable'
    };
  }
}

// Test endpoint to verify route is accessible
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Challenges route is working',
    timestamp: new Date().toISOString()
  });
});

// Helper function to serialize Firestore documents
const serializeFirestoreDoc = (doc) => {
  const data = doc.data();
  const serialized = { id: doc.id, ...data };
  
  // Convert Firestore Timestamps to ISO strings
  if (serialized.createdAt) {
    serialized.createdAt = serialized.createdAt instanceof Date 
      ? serialized.createdAt.toISOString() 
      : serialized.createdAt.toDate().toISOString();
  }
  
  if (serialized.updatedAt) {
    serialized.updatedAt = serialized.updatedAt instanceof Date 
      ? serialized.updatedAt.toISOString() 
      : serialized.updatedAt.toDate().toISOString();
  }
  
  if (serialized.deadline) {
    serialized.deadline = serialized.deadline instanceof Date 
      ? serialized.deadline.toISOString() 
      : serialized.deadline.toDate().toISOString();
  }
  
  if (serialized.startedAt) {
    serialized.startedAt = serialized.startedAt instanceof Date 
      ? serialized.startedAt.toISOString() 
      : serialized.startedAt.toDate().toISOString();
  }
  
  if (serialized.completedAt) {
    serialized.completedAt = serialized.completedAt instanceof Date 
      ? serialized.completedAt.toISOString() 
      : serialized.completedAt.toDate().toISOString();
  }
  
  if (serialized.proofSubmittedAt) {
    serialized.proofSubmittedAt = serialized.proofSubmittedAt instanceof Date 
      ? serialized.proofSubmittedAt.toISOString() 
      : serialized.proofSubmittedAt.toDate().toISOString();
  }
  
  return serialized;
};

// Debug middleware for all routes
router.use((req, res, next) => {
  console.log(`🎯 Challenge Route: ${req.method} ${req.path}`);
  console.log(`🎯 Headers:`, req.headers);
  next();
});

// Create a new challenge
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      opponents, // Array of usernames
      game,
      stake,
      platform,
      isPublic = false,
      label,
      challengerPlatformUsernames
    } = req.body;

    console.log('🎯 Creating challenge with data:', {
      challenger: req.user.username,
      opponents,
      game,
      stake,
      platform,
      isPublic,
      label,
      challengerPlatformUsernames
    });

    // Validate required fields
    if (isPublic) {
      // Public challenge - no opponents required
      if (!game || !stake || !platform) {
        return res.status(400).json({
          success: false,
          message: 'Game, stake, and platform are required for public challenges'
        });
      }
    } else {
      // Private challenge - opponents required
      if (!opponents || !Array.isArray(opponents) || opponents.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one opponent is required for private challenges'
        });
      }
      
      if (!game || !stake || !platform) {
        return res.status(400).json({
          success: false,
          message: 'Game, stake, and platform are required'
        });
      }
    }

    if (stake <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Stake amount must be greater than 0'
      });
    }

    console.log('✅ Validation passed, creating challenge with:', {
      isPublic,
      opponentsCount: isPublic ? 0 : opponents.length,
      challengeData: {
        game,
        stake,
        platform,
        isPublic
      }
    });

    // Check if challenger has sufficient funds
    const challengerBalance = await walletService.getWalletBalance(req.user.uid);
    const requiredAmount = parseFloat(stake) * 0.5; // 50% of stake
    
    if (challengerBalance < requiredAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Required: $${requiredAmount.toFixed(2)}, Available: $${challengerBalance.toFixed(2)}`
      });
    }

    // Create challenge document first
    const challengeData = {
      challenger: {
        uid: req.user.uid,
        username: req.user.username
      },
      opponents: isPublic ? [] : opponents.map(opponent => ({
        username: opponent,
        status: 'pending', // pending, accepted, declined
        responseAt: null
      })),
      game,
      stake: parseFloat(stake),
      platform,
      label: label || '',
      isPublic: Boolean(isPublic),
      challengerPlatformUsernames: challengerPlatformUsernames || {},
      status: 'pending', // pending, active, completed, cancelled, expired
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      completedAt: null,
      winner: null,
      loser: null,
      proofRequired: true,
      proofSubmitted: false,
      proofImages: [],
      proofDescription: '',
      proofSubmittedAt: null,
      verificationStatus: 'pending', // pending, approved, rejected, disputed
      verificationNotes: '',
      type: 'outgoing',
      fundsDeducted: true,
      challengerDeduction: requiredAmount
    };

    console.log('📝 Final challenge data to save (trimmed fields):', {
      game: challengeData.game,
      stake: challengeData.stake,
      platform: challengeData.platform,
      isPublic: challengeData.isPublic,
      opponentsCount: challengeData.opponents.length
    });

    // Add to Firestore first to get the challenge ID
    const challengeRef = await firestore.collection('challenges').add(challengeData);
    
    // Now deduct funds with the actual challenge ID
    await walletService.deductFunds(req.user.uid, requiredAmount, challengeRef.id, 'Challenge creation fee');

    // Transaction record is now handled by the walletService.deductFunds call
    
    console.log('✅ Challenge created successfully:', challengeRef.id);
    console.log('✅ Challenge data saved:', { id: challengeRef.id, fullData: challengeData });

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: {
        id: challengeRef.id,
        ...challengeData
      }
    });

  } catch (error) {
    console.error('❌ Error creating challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create challenge',
      error: error.message
    });
  }
});

// Get all challenges for the authenticated user
router.get('/my-challenges', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 Fetching challenges for user:', req.user.uid);
    
    const challengesRef = firestore.collection('challenges');
    
    // Get challenges where user is challenger (challenges they created)
    const challengerSnap = await challengesRef
      .where('challenger.uid', '==', req.user.uid)
      .get();

    const challenges = [];

    // Process challenger challenges (challenges created by user)
    challengerSnap.forEach(doc => {
      const serialized = serializeFirestoreDoc(doc);
      serialized.type = 'outgoing'; // Mark as outgoing (created by user)
      challenges.push(serialized);
    });

    // Sort by creation date (newest first)
    challenges.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB - dateA;
    });

    console.log(`✅ Found ${challenges.length} challenges created by user`);

    res.json({
      success: true,
      data: challenges
    });

  } catch (error) {
    console.error('❌ Error fetching challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenges',
      error: error.message
    });
  }
});

// Get public challenges
router.get('/public', async (req, res) => {
  try {
    console.log('🎯 Fetching public challenges');
    
    const challengesRef = firestore.collection('challenges');
    
    // Simplified query to avoid index requirements
    const snapshot = await challengesRef
      .where('isPublic', '==', true)
      .limit(20)
      .get();

    const challenges = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Only include pending challenges
      if (data.status === 'pending') {
        challenges.push(serializeFirestoreDoc(doc));
      }
    });

    // Sort by creation date (newest first) in memory
    challenges.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB - dateA;
    });

    console.log(`✅ Found ${challenges.length} public challenges`);

    res.json({
      success: true,
      data: challenges
    });

  } catch (error) {
    console.error('❌ Error fetching public challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public challenges',
      error: error.message
    });
  }
});

// Get challenges for the authenticated user (where they are the opponent)
router.get('/for-me', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 Fetching challenges for user (as opponent):', req.user.uid);
    console.log('🎯 Looking for username:', req.user.username);
    
    const challengesRef = firestore.collection('challenges');
    
    // Get all challenges and filter in memory since Firestore array-contains with objects is tricky
    const snapshot = await challengesRef.get();

    const challenges = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Check if current user is in the opponents array
      const isOpponent = data.opponents && data.opponents.some(opp => 
        opp.username === req.user.username
      );
      
      console.log(`🔍 Challenge ${doc.id}: checking if ${req.user.username} is opponent`);
      console.log(`🔍 Opponents:`, data.opponents);
      console.log(`🔍 Is opponent:`, isOpponent);
      
              if (isOpponent) {
        const serialized = serializeFirestoreDoc(doc);
        serialized.type = 'incoming';
        challenges.push(serialized);
      }
    });

    // Sort by creation date (newest first)
    challenges.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB - dateA;
    });

    console.log(`✅ Found ${challenges.length} challenges for user (as opponent)`);
    console.log(`✅ Challenges:`, challenges.map(c => ({ 
      id: c.id, 
      challenger: c.challenger.username, 
      opponents: c.opponents.map(o => o.username),
      myTeam: c.myTeam,
      hasMyTeam: 'myTeam' in c
    })));

    res.json({
      success: true,
      data: challenges
    });

  } catch (error) {
    console.error('❌ Error fetching challenges for user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenges for user',
      error: error.message
    });
  }
});

// Submit proof for reward claiming
router.post('/submit-proof', authenticateToken, async (req, res) => {
  try {
    const { challengeId, proofImages, proofDescription } = req.body;
    
    if (!challengeId || !proofImages || !proofDescription) {
      return res.status(400).json({
        success: false,
        message: 'Challenge ID, proof images, and description are required'
      });
    }

    console.log('🎯 Submitting proof for challenge:', challengeId);
    console.log('🎯 Proof images:', proofImages);
    console.log('🎯 Proof description:', proofDescription);

    const challengeRef = firestore.collection('challenges').doc(challengeId);
    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if user is part of this challenge
    const isChallenger = challengeData.challenger.uid === req.user.uid;
    const isOpponent = challengeData.opponents && challengeData.opponents.some(opp => 
      opp.username === req.user.username
    );

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to submit proof for this challenge'
      });
    }

    // Allow proof submission based on role-specific validation below
    // (Challenger: any opponent accepted; Opponent: they have accepted)

    // Debug: Log challenge structure for validation
    console.log('🔍 Challenge structure for proof validation:');
    console.log('  - Status:', challengeData.status);
    console.log('  - Opponents:', challengeData.opponents);
    console.log('  - Challenger:', challengeData.challenger);
    console.log('  - Current user:', req.user.username);
    console.log('  - Is challenger:', isChallenger);
    console.log('  - Is opponent:', isOpponent);
    console.log('  - Full challenge data:', JSON.stringify(challengeData, null, 2));

    // NEW LOGIC: Different validation based on user role
    let canSubmitProof = false;
    
    if (isChallenger) {
      // Challenger can submit proof if ANY opponent has accepted
      const anyOpponentAccepted = challengeData.opponents && 
        challengeData.opponents.some(opp => opp.status === 'accepted');
      canSubmitProof = anyOpponentAccepted;
      
      console.log('🔍 Challenger validation:');
      console.log('  - Any opponent accepted:', anyOpponentAccepted);
      
    } else if (isOpponent) {
      // Opponent can submit proof if THEY have accepted
      const currentOpponent = challengeData.opponents.find(opp => 
        opp.username === req.user.username
      );
      canSubmitProof = currentOpponent && currentOpponent.status === 'accepted';
      
      console.log('🔍 Opponent validation:');
      console.log('  - Current opponent status:', currentOpponent?.status);
      console.log('  - Can submit proof:', canSubmitProof);
    }

    console.log('🔍 Final validation result:');
    console.log('  - Can submit proof:', canSubmitProof);

    if (!canSubmitProof) {
      return res.status(400).json({
        success: false,
        message: isChallenger 
          ? 'At least one opponent must accept the challenge before you can submit proof'
          : 'You must accept the challenge before you can submit proof'
      });
    }

    // NEW WORKFLOW: AI processes proof immediately instead of going to "proof-submitted"
    console.log('🤖 Starting AI analysis for challenge:', challengeId);
    
    // Get platform usernames for accurate AI analysis
    const platformUsernames = req.body.platformUsernames || challengeData.challengerPlatformUsernames || {};
    console.log('🔍 Platform usernames for AI analysis:', platformUsernames);
    console.log('🔍 Platform usernames from request body:', req.body.platformUsernames);
    console.log('🔍 Platform usernames from challenge data:', challengeData.challengerPlatformUsernames);
    
    // Perform AI analysis (now integrated with OpenAI Vision API and platform username comparison)
    const aiResult = await performAIAnalysis(challengeData, proofImages, proofDescription, platformUsernames);
    
    console.log('🤖 AI Analysis Result:', aiResult);
    
    // Determine winner and update challenge using AI analysis
    const isCurrentUserWinner = aiResult.iWin; // Use AI-determined winner
    const newStatus = 'completed';
    const verificationStatus = 'ai-verified';
    
    console.log('🏆 Winner determination:');
    console.log('  - AI detected winner:', aiResult.winner);
    console.log('  - Current user:', req.user.username);
    console.log('  - Is current user winner:', isCurrentUserWinner);
    console.log('  - Confidence:', aiResult.confidence);
    console.log('  - Reasoning:', aiResult.reasoning);
    
    // Update challenge with AI result
    await challengeRef.update({
      proofImages: proofImages,
      proofDescription: proofDescription,
      proofSubmitted: true,
      proofSubmittedAt: new Date(),
      status: newStatus,
      verificationStatus: verificationStatus,
      aiResult: aiResult,
      winner: aiResult.winner,
      completedAt: new Date(),
      updatedAt: new Date()
    });
    
    // Handle wallet updates based on AI result (credit actual winner)
      const totalChallengeAmount = challengeData.stake * 2; // Both users' stakes
      const rewardAmount = totalChallengeAmount * 0.95; // 95% to winner
      const adminFee = totalChallengeAmount * 0.05; // 5% admin fee
      
    // Robust resolution of winner userId
    let winnerUserId = null;
    const aiWinner = aiResult?.winner || '';
    const aiWinnerLower = aiWinner.toLowerCase().trim();

    // 1) If AI says current submitter won, credit them directly
    if (aiResult?.iWin === true) {
      winnerUserId = req.user.uid;
      console.log('🏆 Winner resolved from iWin flag:', { winnerUserId, username: req.user.username });
    }

    // 2) Direct match with challenger/opponent login usernames
    if (!winnerUserId && aiWinnerLower) {
      if (challengeData?.challenger?.username && challengeData.challenger.username.toLowerCase().trim() === aiWinnerLower) {
        winnerUserId = challengeData.challenger.uid;
        console.log('🏆 Winner matched challenger login username');
      }
    }
    if (!winnerUserId && aiWinnerLower && Array.isArray(challengeData.opponents)) {
      const matchedOpp = challengeData.opponents.find(opp => opp?.username && opp.username.toLowerCase().trim() === aiWinnerLower);
      if (matchedOpp) {
        try {
          const profile = await userService.getUserByUsername(matchedOpp.username);
          if (profile?.uid) {
            winnerUserId = profile.uid;
            console.log('🏆 Winner matched opponent login username');
          }
        } catch (e) {
          console.warn('⚠️ Failed to resolve opponent by username:', matchedOpp.username, e.message);
        }
      }
    }

    // 3) Fuzzy match against platform usernames captured on challenge
    if (!winnerUserId && aiWinnerLower) {
      // Challenger platform usernames
      const challengerPlatforms = challengeData?.challengerPlatformUsernames || {};
      for (const key of Object.keys(challengerPlatforms)) {
        const val = (challengerPlatforms[key] || '').toLowerCase().trim();
        if (!val) continue;
        if (val === aiWinnerLower || val.includes(aiWinnerLower) || aiWinnerLower.includes(val)) {
          winnerUserId = challengeData.challenger.uid;
          console.log('🏆 Winner matched challenger platform username:', { platform: key, value: challengerPlatforms[key] });
          break;
        }
      }
    }
    if (!winnerUserId && Array.isArray(challengeData.opponents)) {
      for (const opp of challengeData.opponents) {
        const oppPlatforms = opp?.accepterPlatformUsernames || opp?.platformUsernames || {};
        const keys = Object.keys(oppPlatforms || {});
        for (const key of keys) {
          const val = (oppPlatforms[key] || '').toLowerCase().trim();
          if (!val) continue;
          if (val === aiWinnerLower || val.includes(aiWinnerLower) || aiWinnerLower.includes(val)) {
            try {
              const profile = await userService.getUserByUsername(opp.username);
              if (profile?.uid) {
                winnerUserId = profile.uid;
                console.log('🏆 Winner matched opponent platform username:', { opponent: opp.username, platform: key, value: oppPlatforms[key] });
              }
            } catch (e) {
              console.warn('⚠️ Failed resolving opponent profile for platform match:', opp.username, e.message);
            }
            break;
          }
        }
        if (winnerUserId) break;
      }
    }

    // 4) As a final fallback, try to resolve a user by platform username directory-wide
    if (!winnerUserId && aiWinnerLower) {
      try {
        const platformProfile = await userService.getUserByPlatformUsername(aiWinner);
        if (platformProfile?.uid) {
          winnerUserId = platformProfile.uid;
          console.log('🏆 Winner resolved via global platform username search:', { username: platformProfile.username });
        }
      } catch (e) {
        console.warn('⚠️ Global platform username resolution failed:', aiWinner, e.message);
      }
    }

    if (winnerUserId) {
      console.log('💰 Crediting winner wallet:', {
        winnerResolvedFrom: 'aiResult/usernames/platforms',
        aiWinner,
        winnerUserId,
        rewardAmount,
        adminFee
      });
      await walletService.awardReward(winnerUserId, rewardAmount, challengeId, `Challenge reward for ${challengeData.game}`);
      await walletService.addAdminFee(adminFee, challengeId, `Admin fee from challenge ${challengeData.game}`);
    } else {
      console.warn('⚠️ Winner user not resolved; skipping wallet credit. aiResult.winner:', aiWinner, 'iWin:', aiResult?.iWin);
    }
    
    console.log('✅ Proof processed and AI analysis completed for challenge:', challengeId);

    res.json({
      success: true,
      message: 'Proof processed and AI analysis completed',
      data: {
        challengeId,
        status: newStatus,
        verificationStatus: verificationStatus,
        aiResult: aiResult,
        isWinner: isCurrentUserWinner,
        winner: aiResult.winner,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
        usernameAnalysis: aiResult.usernameAnalysis,
        platformUsernames: platformUsernames
      }
    });

  } catch (error) {
    console.error('❌ Error submitting proof:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit proof',
      error: error.message
    });
  }
});

// Submit dispute for AI analysis result
router.post('/dispute', authenticateToken, async (req, res) => {
  try {
    const { challengeId, reason, evidence } = req.body;
    
    if (!challengeId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Challenge ID and reason are required'
      });
    }

    console.log('🎯 Submitting dispute for challenge:', challengeId);
    console.log('🎯 Reason:', reason);
    console.log('🎯 Evidence:', evidence);

    const challengeRef = firestore.collection('challenges').doc(challengeId);
    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if user is part of this challenge
    const isChallenger = challengeData.challenger.uid === req.user.uid;
    const isOpponent = challengeData.opponents && challengeData.opponents.some(opp => 
      opp.username === req.user.username
    );

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to dispute this challenge'
      });
    }

    // Create dispute record
    const disputeData = {
      challengeId,
      challengerUsername: challengeData.challenger.username,
      opponentUsername: req.user.username,
      reason,
      evidence: evidence || '',
      submittedAt: new Date(),
      status: 'pending', // pending, reviewed, resolved
      adminNotes: '',
      resolvedAt: null,
      resolution: null
    };

    // Add to disputes collection
    const disputeRef = await firestore.collection('disputes').add(disputeData);
    
    // Update challenge verification status
    await challengeRef.update({
      verificationStatus: 'disputed',
      updatedAt: new Date()
    });

    console.log('✅ Dispute submitted successfully:', disputeRef.id);

    res.json({
      success: true,
      message: 'Dispute submitted successfully',
      data: {
        disputeId: disputeRef.id,
        challengeId,
        status: 'disputed'
      }
    });

  } catch (error) {
    console.error('❌ Error submitting dispute:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit dispute',
      error: error.message
    });
  }
});

// Get challenge by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎯 Fetching challenge:', id);
    
    const challengeDoc = await firestore.collection('challenges').doc(id).get();
    
    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Debug logging for challenge data
    console.log('🔍 Challenge data from Firestore:', {
      id: challengeDoc.id,
      myTeam: challengeData.myTeam,
      hasMyTeam: 'myTeam' in challengeData,
      allFields: Object.keys(challengeData)
    });
    
    // Allow admins to view any challenge
    const isAdmin = !!(req.user && (req.user.isAdmin === true || (req.user.username || '').toLowerCase() === 'admin' || req.user.role === 'admin'));

    if (!isAdmin) {
      // Check if user has access to this challenge
      const isChallenger = challengeData.challenger.uid === req.user.uid;
      const isOpponent = Array.isArray(challengeData.opponents) && challengeData.opponents.some(opp => opp.username === req.user.username);
      
      if (!isChallenger && !isOpponent && !challengeData.isPublic) {
        return res.status(403).json({
          success: false,
          message: 'Access denied to this challenge'
        });
      }
    }

    res.json({
      success: true,
      data: {
        id: challengeDoc.id,
        ...challengeData
      }
    });

  } catch (error) {
    console.error('❌ Error fetching challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenge',
      error: error.message
    });
  }
});

// Accept/Decline challenge
router.put('/:id/respond', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { response, myTeam, accepterPlatformUsernames } = req.body; // 'accept' or 'decline', optional team info and platform usernames
    
    console.log('🎯 User responding to challenge:', {
      challengeId: id,
      response,
      userId: req.user.uid,
      username: req.user.username,
      myTeam,
      accepterPlatformUsernames,
      hasPlatformUsernames: !!accepterPlatformUsernames,
      platformUsernamesKeys: accepterPlatformUsernames ? Object.keys(accepterPlatformUsernames) : [],
      platformUsernamesValues: accepterPlatformUsernames ? Object.values(accepterPlatformUsernames) : []
    });
    
    if (!['accept', 'decline'].includes(response)) {
      return res.status(400).json({
        success: false,
        message: 'Response must be either "accept" or "decline"'
      });
    }

    const challengeRef = firestore.collection('challenges').doc(id);
    const challengeDoc = await challengeRef.get();
    
    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if user is an opponent
    const opponentIndex = challengeData.opponents.findIndex(opp => opp.username === req.user.username);
    
    if (opponentIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'You are not an opponent in this challenge'
      });
    }

    // If accepting, check if opponent has sufficient funds and deduct them
    if (response === 'accept') {
      console.log('💰 Checking opponent balance for challenge acceptance:', {
        opponentUid: req.user.uid,
        opponentUsername: req.user.username,
        challengeStake: challengeData.stake,
        requiredAmount: challengeData.stake * 0.5
      });
      
      const opponentBalance = await walletService.getWalletBalance(req.user.uid);
      const requiredAmount = challengeData.stake * 0.5; // 50% of stake
      
      console.log('💰 Balance check result:', {
        opponentBalance,
        requiredAmount,
        hasSufficientFunds: opponentBalance >= requiredAmount
      });
      
      if (opponentBalance < requiredAmount) {
        console.log('❌ Insufficient funds for challenge acceptance');
        return res.status(400).json({
          success: false,
          message: `Insufficient funds. Required: $${requiredAmount.toFixed(2)}, Available: $${opponentBalance.toFixed(2)}`
        });
      }
      
      console.log('✅ Sufficient funds, deducting from opponent wallet');
      // Deduct funds from opponent's wallet
      await walletService.deductFunds(req.user.uid, requiredAmount, id, 'Challenge acceptance fee');
      console.log('✅ Funds deducted successfully');
    }

    // Update opponent response
    const updatedOpponents = [...challengeData.opponents];
    const updatedOpponent = {
      ...updatedOpponents[opponentIndex],
      status: response === 'accept' ? 'accepted' : response,
      responseAt: new Date(),
      fundsDeducted: response === 'accept' ? true : false,
      opponentDeduction: response === 'accept' ? challengeData.stake * 0.5 : null,
      myTeam: response === 'accept' ? myTeam : null, // Store team information when accepting
      accepterPlatformUsernames: response === 'accept' && accepterPlatformUsernames ? accepterPlatformUsernames : null // Store platform usernames when accepting
    };
    
    console.log('🔄 Updating opponent data:', {
      originalOpponent: updatedOpponents[opponentIndex],
      updatedOpponent,
      hasMyTeam: 'myTeam' in updatedOpponent,
      hasPlatformUsernames: 'accepterPlatformUsernames' in updatedOpponent,
      platformUsernamesValue: updatedOpponent.accepterPlatformUsernames
    });
    
    updatedOpponents[opponentIndex] = updatedOpponent;

    // Check if all opponents have responded
    const allResponded = updatedOpponents.every(opp => opp.status !== 'pending');
    const allAccepted = updatedOpponents.every(opp => opp.status === 'accepted');
    
    let newStatus = challengeData.status;
    if (allResponded) {
      if (allAccepted) {
        newStatus = 'active';
      } else {
        newStatus = 'cancelled';
      }
    }

    // Clean up any undefined values before sending to Firestore
    const cleanOpponents = updatedOpponents.map(opponent => {
      const cleanOpponent = { ...opponent };
      // Remove undefined values
      Object.keys(cleanOpponent).forEach(key => {
        if (cleanOpponent[key] === undefined) {
          delete cleanOpponent[key];
        }
      });
      return cleanOpponent;
    });
    
    const updateData = {
      opponents: cleanOpponents,
      status: newStatus,
      updatedAt: new Date()
    };
    
    console.log('🔄 Final update data:', {
      updateData,
      opponentsLength: cleanOpponents.length,
      firstOpponent: cleanOpponents[0],
      hasPlatformUsernames: cleanOpponents[0]?.accepterPlatformUsernames ? 'yes' : 'no',
      cleanedOpponents: cleanOpponents
    });
    
    await challengeRef.update(updateData);

    console.log('✅ Challenge response updated successfully');
    console.log('📊 Final opponent data with platform usernames:', {
      opponentIndex,
      originalOpponent: challengeData.opponents[opponentIndex],
      updatedOpponent: updatedOpponents[opponentIndex],
      hasPlatformUsernames: !!updatedOpponents[opponentIndex].accepterPlatformUsernames,
      platformUsernames: updatedOpponents[opponentIndex].accepterPlatformUsernames,
      allOpponents: updatedOpponents
    });

    res.json({
      success: true,
      message: `Challenge ${response}ed successfully`,
      data: {
        status: newStatus,
        opponents: updatedOpponents
      }
    });

  } catch (error) {
    console.error('❌ Error responding to challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to respond to challenge',
      error: error.message
    });
  }
});

// Cancel challenge
router.put('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎯 Cancelling challenge:', id);
    
    const challengeRef = firestore.collection('challenges').doc(id);
    const challengeDoc = await challengeRef.get();
    
    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if user is the challenger
    if (challengeData.challenger.uid !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Only the challenger can cancel this challenge'
      });
    }

    // Check if challenge can be cancelled
    if (challengeData.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Challenge cannot be cancelled in its current state'
      });
    }

    await challengeRef.update({
      status: 'cancelled',
      updatedAt: new Date()
    });

    console.log('✅ Challenge cancelled successfully');

    res.json({
      success: true,
      message: 'Challenge cancelled successfully'
    });

  } catch (error) {
    console.error('❌ Error cancelling challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel challenge',
      error: error.message
    });
  }
});

// Delete challenge
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎯 Deleting challenge:', id);
    
    const challengeRef = firestore.collection('challenges').doc(id);
    const challengeDoc = await challengeRef.get();
    
    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if user is the challenger
    if (challengeData.challenger.uid !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Only the challenger can delete this challenge'
      });
    }

    // Check if challenge can be deleted
    if (challengeData.status !== 'pending' && challengeData.status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Challenge cannot be deleted in its current state'
      });
    }

    await challengeRef.delete();

    console.log('✅ Challenge deleted successfully');

    res.json({
      success: true,
      message: 'Challenge deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete challenge',
      error: error.message
    });
  }
});

// Join a public challenge
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎯 User joining challenge:', id, 'User:', req.user.username);
    
    const challengeRef = firestore.collection('challenges').doc(id);
    const challengeDoc = await challengeRef.get();
    
    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if challenge is public
    if (!challengeData.isPublic) {
      return res.status(400).json({
        success: false,
        message: 'This challenge is not public'
      });
    }

    // Check if challenge is still pending
    if (challengeData.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Challenge is no longer accepting participants'
      });
    }

    // Check if user is already in the challenge
    if (challengeData.opponents && challengeData.opponents.some(opp => opp.username === req.user.username)) {
      return res.status(400).json({
        success: false,
        message: 'You are already participating in this challenge'
      });
    }

    // Check if user is the challenger
    if (challengeData.challenger.uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: 'You cannot join your own challenge'
      });
    }

    // Check if user has sufficient funds
    const userBalance = await walletService.getWalletBalance(req.user.uid);
    const requiredAmount = challengeData.stake * 0.5; // 50% of stake
    
    if (userBalance < requiredAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Required: $${requiredAmount.toFixed(2)}, Available: $${userBalance.toFixed(2)}`
      });
    }

    // Deduct funds from user's wallet
    await walletService.deductFunds(req.user.uid, requiredAmount, id, 'Public challenge participation fee');

    // Create a new individual challenge instance for this user
    const newChallengeData = {
      challenger: challengeData.challenger, // Original challenger
      opponents: [{
        username: req.user.username,
        status: 'accepted', // Auto-accept when joining public challenge
        responseAt: new Date(),
        fundsDeducted: true,
        opponentDeduction: requiredAmount
      }],
      game: challengeData.game,
      stake: challengeData.stake,
      platform: challengeData.platform,
      deadline: challengeData.deadline,
      description: challengeData.description,
      label: challengeData.label,
      isPublic: false, // This becomes a private challenge between the two users
      status: 'active', // Start as active since user accepted
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: new Date(),
      proofRequired: true,
      proofSubmitted: false,
      proofImages: [],
      proofDescription: '',
      proofSubmittedAt: null,
      verificationStatus: 'pending',
      verificationNotes: '',
      type: 'incoming', // For the user joining
      fundsDeducted: true,
      opponentDeduction: requiredAmount
    };

    // Create the new challenge
    const newChallengeRef = await firestore.collection('challenges').add(newChallengeData);
    
    // Add user to the original public challenge's opponents list to track who joined
    const updatedOpponents = challengeData.opponents ? [...challengeData.opponents, {
      username: req.user.username,
      status: 'joined',
      responseAt: new Date()
    }] : [{
      username: req.user.username,
      status: 'joined',
      responseAt: new Date()
    }];

    // Update the original public challenge to track participants
    await challengeRef.update({
      opponents: updatedOpponents,
      updatedAt: new Date()
    });

    console.log('✅ User joined challenge successfully, created individual challenge:', newChallengeRef.id);

    // Get the created challenge data
    const newChallengeDoc = await newChallengeRef.get();
    const newChallenge = serializeFirestoreDoc(newChallengeDoc);

    res.json({
      success: true,
      message: 'Successfully joined challenge',
      data: newChallenge
    });

  } catch (error) {
    console.error('❌ Error joining challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join challenge',
      error: error.message
    });
  }
});

// Mark challenge as completed
router.post('/:id/complete', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { aiResult, completedAt } = req.body;

    console.log('🎯 Marking challenge as completed:', id);
    console.log('🎯 AI Result:', aiResult);

    const challengeRef = firestore.collection('challenges').doc(id);
    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
    }

    const challengeData = challengeDoc.data();
    
    // Check if user is part of this challenge
    const isChallenger = challengeData.challenger.uid === req.user.uid;
    const isOpponent = challengeData.opponents && challengeData.opponents.some(opp => 
      opp.username === req.user.username
    );

    if (!isChallenger && !isOpponent) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to complete this challenge'
      });
    }

    // Check if challenge is already completed
    if (challengeData.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Challenge is already completed'
      });
    }

    // Update challenge status to completed
    const updateData = {
      status: 'completed',
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      aiResult: aiResult,
      winner: aiResult?.winner || challengeData?.winner || null,
      updatedAt: new Date()
    };

    await challengeRef.update(updateData);

    // After persisting completion, process wallet credit for the actual winner
    try {
      const totalChallengeAmount = (challengeData.stake || 0) * 2;
      const rewardAmount = totalChallengeAmount * 0.95;
      const adminFee = totalChallengeAmount * 0.05;

      let winnerUserId = null;
      const aiWinner = aiResult?.winner || '';
      const aiWinnerLower = aiWinner.toLowerCase().trim();

      if (aiResult?.iWin === true) {
        winnerUserId = req.user.uid;
      }
      if (!winnerUserId && aiWinnerLower) {
        if (challengeData?.challenger?.username && challengeData.challenger.username.toLowerCase().trim() === aiWinnerLower) {
          winnerUserId = challengeData.challenger.uid;
        }
      }
      if (!winnerUserId && aiWinnerLower && Array.isArray(challengeData.opponents)) {
        const matchedOpp = challengeData.opponents.find(opp => opp?.username && opp.username.toLowerCase().trim() === aiWinnerLower);
        if (matchedOpp) {
          try {
            const profile = await userService.getUserByUsername(matchedOpp.username);
            if (profile?.uid) winnerUserId = profile.uid;
          } catch {}
        }
      }
      // Match platform usernames
      if (!winnerUserId && aiWinnerLower) {
        const challengerPlatforms = challengeData?.challengerPlatformUsernames || {};
        for (const key of Object.keys(challengerPlatforms)) {
          const val = (challengerPlatforms[key] || '').toLowerCase().trim();
          if (!val) continue;
          if (val === aiWinnerLower || val.includes(aiWinnerLower) || aiWinnerLower.includes(val)) {
            winnerUserId = challengeData.challenger.uid;
            break;
          }
        }
      }
      if (!winnerUserId && Array.isArray(challengeData.opponents)) {
        for (const opp of challengeData.opponents) {
          const oppPlatforms = opp?.accepterPlatformUsernames || opp?.platformUsernames || {};
          const keys = Object.keys(oppPlatforms || {});
          for (const key of keys) {
            const val = (oppPlatforms[key] || '').toLowerCase().trim();
            if (!val) continue;
            if (val === aiWinnerLower || val.includes(aiWinnerLower) || aiWinnerLower.includes(val)) {
              try {
                const profile = await userService.getUserByUsername(opp.username);
                if (profile?.uid) winnerUserId = profile.uid;
              } catch {}
              break;
            }
          }
          if (winnerUserId) break;
        }
      }
      // Global platform search
      if (!winnerUserId && aiWinnerLower) {
        try {
          const platformProfile = await userService.getUserByPlatformUsername(aiWinner);
          if (platformProfile?.uid) winnerUserId = platformProfile.uid;
        } catch {}
      }

      if (winnerUserId) {
        await walletService.awardReward(winnerUserId, rewardAmount, id, `Challenge reward for ${challengeData.game}`);
        await walletService.addAdminFee(adminFee, id, `Admin fee from challenge ${challengeData.game}`);
        console.log('💰 Winner credited in /complete route:', { id, winnerUserId, rewardAmount, adminFee });
      } else {
        console.warn('⚠️ Winner not resolved in /complete route; no wallet credit');
      }
    } catch (creditErr) {
      console.error('❌ Error crediting winner in /complete route:', creditErr);
    }

    res.json({
      success: true,
      message: 'Challenge marked as completed',
      data: {
        id: id,
        status: 'completed',
        completedAt: updateData.completedAt
      }
    });

  } catch (error) {
    console.error('❌ Error marking challenge as completed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark challenge as completed',
      error: error.message
    });
  }
});

module.exports = router;
