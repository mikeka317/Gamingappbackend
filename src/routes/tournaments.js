const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { authenticateToken } = require('../middleware/auth');
const { processTournamentEntry, processTournamentReward, refundTournamentEntry } = require('../services/walletService');
const notificationService = require('../services/notificationService');

const db = admin.firestore();

// Generate next round matches when current round is completed
function generateNextRoundMatches(currentMatches, completedRound) {
  const currentRoundMatches = currentMatches.filter(m => m.round === completedRound);
  const winners = currentRoundMatches
    .filter(m => m.status === 'completed' && m.winner)
    .map(m => {
      const winnerData = m.winner === m.player1.uid ? m.player1 : m.player2;
      return {
        uid: winnerData.uid,
        username: winnerData.username,
        level: winnerData.level || Math.floor(Math.random() * 50) + 20, // Add level for display
        wonMatchId: m.id,
        wonAt: new Date()
      };
    });

  if (winners.length === 0) {
    console.log('❌ No winners found for round', completedRound);
    return [];
  }

  console.log(`🏆 Winners for round ${completedRound}:`, winners.map(w => w.username));

  const nextRound = completedRound + 1;
  const nextRoundMatches = [];

  // Pair winners for next round
  for (let i = 0; i < winners.length; i += 2) {
    if (i + 1 < winners.length) {
      const matchId = `match_${nextRound}_${Math.floor(i / 2) + 1}`;
      const match = {
        id: matchId,
        round: nextRound,
        matchNumber: Math.floor(i / 2) + 1,
        player1: winners[i],
        player2: winners[i + 1],
        status: 'pending',
        winner: null,
        createdAt: new Date()
      };
      nextRoundMatches.push(match);
      console.log(`🎯 Created next round match: ${winners[i].username} vs ${winners[i + 1].username}`);
    } else {
      // Odd number of winners - winner gets a bye
      console.log(`🏆 ${winners[i].username} gets a bye to the next round`);
    }
  }

  return nextRoundMatches;
}

// Update next round matches with actual winner data
function updateNextRoundMatches(tournament, completedMatch) {
  const nextRound = completedMatch.round + 1;
  const nextRoundMatches = tournament.bracket.filter(m => m.round === nextRound);
  
  if (nextRoundMatches.length === 0) {
    console.log(`🔍 No next round matches found for round ${nextRound}`);
    return tournament.bracket;
  }

  // Get the winner data from the completed match
  const winnerData = completedMatch.winner === completedMatch.player1.uid ? completedMatch.player1 : completedMatch.player2;
  const winnerInfo = {
    uid: winnerData.uid,
    username: winnerData.username,
    level: winnerData.level || Math.floor(Math.random() * 50) + 20,
    wonMatchId: completedMatch.id,
    wonAt: new Date()
  };

  console.log(`🔄 Updating next round matches with winner: ${winnerInfo.username}`);

  // Update the bracket with the actual winner
  const updatedBracket = tournament.bracket.map(match => {
    if (match.round === nextRound) {
      console.log(`🔍 Checking match ${match.id} for updates:`, {
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        player1Username: match.player1Username,
        player2Username: match.player2Username,
        completedMatchId: completedMatch.id
      });

      // Check if this match should be updated with the winner
      const isMatch1Winner = match.player1Id === 'winner_1_0' && completedMatch.id === 'match_1';
      const isMatch2Winner = match.player1Id === 'winner_1_1' && completedMatch.id === 'match_2';
      const isMatch1Winner2 = match.player2Id === 'winner_1_0' && completedMatch.id === 'match_1';
      const isMatch2Winner2 = match.player2Id === 'winner_1_1' && completedMatch.id === 'match_2';

      // Also check by username for existing matches
      const isMatch1WinnerByUsername = match.player1Username === 'Winner of Round 1 Match 1' && completedMatch.id === 'match_1';
      const isMatch2WinnerByUsername = match.player1Username === 'Winner of Round 1 Match 2' && completedMatch.id === 'match_2';
      const isMatch1Winner2ByUsername = match.player2Username === 'Winner of Round 1 Match 1' && completedMatch.id === 'match_1';
      const isMatch2Winner2ByUsername = match.player2Username === 'Winner of Round 1 Match 2' && completedMatch.id === 'match_2';

      if (isMatch1Winner || isMatch1Winner2 || isMatch1WinnerByUsername || isMatch1Winner2ByUsername) {
        console.log(`🎯 Updating match ${match.id} with winner from ${completedMatch.id}: ${winnerInfo.username}`);
        return {
          ...match,
          player1: (isMatch1Winner || isMatch1WinnerByUsername) ? winnerInfo : match.player1,
          player2: (isMatch1Winner2 || isMatch1Winner2ByUsername) ? winnerInfo : match.player2,
          player1Id: (isMatch1Winner || isMatch1WinnerByUsername) ? winnerInfo.uid : match.player1Id,
          player2Id: (isMatch1Winner2 || isMatch1Winner2ByUsername) ? winnerInfo.uid : match.player2Id,
          player1Username: (isMatch1Winner || isMatch1WinnerByUsername) ? winnerInfo.username : match.player1Username,
          player2Username: (isMatch1Winner2 || isMatch1Winner2ByUsername) ? winnerInfo.username : match.player2Username
        };
      } else if (isMatch2Winner || isMatch2Winner2 || isMatch2WinnerByUsername || isMatch2Winner2ByUsername) {
        console.log(`🎯 Updating match ${match.id} with winner from ${completedMatch.id}: ${winnerInfo.username}`);
        return {
          ...match,
          player1: (isMatch2Winner || isMatch2WinnerByUsername) ? winnerInfo : match.player1,
          player2: (isMatch2Winner2 || isMatch2Winner2ByUsername) ? winnerInfo : match.player2,
          player1Id: (isMatch2Winner || isMatch2WinnerByUsername) ? winnerInfo.uid : match.player1Id,
          player2Id: (isMatch2Winner2 || isMatch2Winner2ByUsername) ? winnerInfo.uid : match.player2Id,
          player1Username: (isMatch2Winner || isMatch2WinnerByUsername) ? winnerInfo.username : match.player1Username,
          player2Username: (isMatch2Winner2 || isMatch2Winner2ByUsername) ? winnerInfo.username : match.player2Username
        };
      }
    }
    return match;
  });

  return updatedBracket;
}

// Get tournament types from database
async function getTournamentTypes() {
  try {
    console.log('🔍 Fetching tournament types for tournaments...');
    
    // Try the optimized query first
    let tournamentTypesSnapshot;
    try {
      tournamentTypesSnapshot = await db.collection('tournamentTypes')
        .where('isActive', '==', true)
        .orderBy('displayOrder', 'asc')
        .get();
    } catch (indexError) {
      console.log('⚠️ Index error in getTournamentTypes, using simple query:', indexError.message);
      // Fallback to simple query without orderBy
      tournamentTypesSnapshot = await db.collection('tournamentTypes')
        .where('isActive', '==', true)
        .get();
    }

    const tournamentTypes = {};
    tournamentTypesSnapshot.forEach(doc => {
      const data = doc.data();
      tournamentTypes[data.key] = {
        players: data.players,
        entryFee: data.entryFee,
        winnerReward: data.winnerReward,
        adminReward: data.adminReward,
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color
      };
    });

    console.log('✅ Tournament types loaded:', Object.keys(tournamentTypes));
    return tournamentTypes;
  } catch (error) {
    console.error('❌ Error fetching tournament types:', error);
    // Fallback to default types
    console.log('🔄 Using fallback tournament types');
    return {
      clash: { players: 4, entryFee: 10, winnerReward: 0.9, adminReward: 0.1, name: 'Clash', description: 'Quick 4-player battles', icon: '⚔️', color: 'bg-red-500' },
      battle: { players: 8, entryFee: 20, winnerReward: 0.8, adminReward: 0.2, name: 'Battle', description: 'Epic 8-player wars', icon: '🔥', color: 'bg-orange-500' },
      rumble: { players: 16, entryFee: 50, winnerReward: 0.8, adminReward: 0.2, name: 'Rumble', description: 'Massive 16-player clashes', icon: '💥', color: 'bg-yellow-500' },
      warzone: { players: 32, entryFee: 100, winnerReward: 0.8, adminReward: 0.2, name: 'Warzone', description: 'Ultimate 32-player battles', icon: '🌪️', color: 'bg-purple-500' }
    };
  }
}

// Get all active tournaments
router.get('/active', authenticateToken, async (req, res) => {
  try {
    console.log('🔍 Fetching active tournaments...');
    
    const TOURNAMENT_TYPES = await getTournamentTypes();
    console.log('🔍 Tournament types from DB:', Object.keys(TOURNAMENT_TYPES));
    const tournaments = {};
    
    for (const [type, config] of Object.entries(TOURNAMENT_TYPES)) {
      try {
        console.log(`🔍 Checking for existing ${type} tournament...`);
        
        // Check for existing active tournament with fallback for missing index
        let activeTournamentQuery;
        try {
          activeTournamentQuery = await db.collection('tournaments')
            .where('type', '==', type)
            .where('status', 'in', ['waiting', 'starting', 'in_progress'])
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        } catch (indexError) {
          console.log(`⚠️ Index error for ${type}, using simple query:`, indexError.message);
          // Fallback to simple query without orderBy
          activeTournamentQuery = await db.collection('tournaments')
            .where('type', '==', type)
            .where('status', 'in', ['waiting', 'starting', 'in_progress'])
            .get();
        }

        if (!activeTournamentQuery.empty) {
          const tournament = activeTournamentQuery.docs[0].data();
          tournament.id = activeTournamentQuery.docs[0].id;
          tournaments[type] = tournament;
          console.log(`✅ Found active ${type} tournament:`, tournament.id);
        } else {
          // Create new tournament automatically
          console.log(`🆕 Creating new ${type} tournament...`);
          const newTournament = await createNewTournament(type, config);
          tournaments[type] = newTournament;
        }
      } catch (typeError) {
        console.error(`❌ Error processing ${type} tournament:`, typeError);
        // Continue with other tournament types even if one fails
        continue;
      }
    }

    console.log('🔍 Returning tournaments:', Object.keys(tournaments));
    res.json({
      success: true,
      tournaments
    });
  } catch (error) {
    console.error('❌ Error fetching active tournaments:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active tournaments',
      error: error.message
    });
  }
});

// Join tournament
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, tournamentType } = req.body;
    const userId = req.user.uid;
    const userEmail = req.user.email;

    console.log(`🎯 User ${userId} joining tournament ${tournamentId} (${tournamentType})`);

    // Get tournament
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();

    // Check if tournament is joinable
    if (tournament.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Tournament is not accepting new participants'
      });
    }

    // Check if user is already in this tournament
    const existingParticipant = tournament.participants?.find(p => p.uid === userId);
    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        message: 'You are already in this tournament'
      });
    }

    // Check if tournament is full
    if (tournament.participants?.length >= tournament.players) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is full'
      });
    }

    // Remove user from other tournaments of the same type
    console.log(`🔄 Removing user from other ${tournamentType} tournaments...`);
    await removeUserFromOtherTournaments(userId, tournamentType);

    // Add user to tournament
    console.log(`➕ Adding user to tournament...`);
    console.log(`👤 User data:`, {
      uid: userId,
      email: userEmail,
      username: req.user.username,
      fallbackUsername: userEmail.split('@')[0]
    });
    
    const participant = {
      uid: userId,
      username: req.user.username || userEmail.split('@')[0],
      joinedAt: new Date()
    };
    
    console.log(`👥 Participant being added:`, participant);

    await tournamentRef.update({
      participants: admin.firestore.FieldValue.arrayUnion(participant),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ User ${userId} joined tournament ${tournamentId}`);

    // Check if tournament is now full and start it
    console.log(`🔍 Checking if tournament should start...`);
    const updatedTournament = await checkAndStartTournament(tournamentId);

    res.json({
      success: true,
      message: 'Successfully joined tournament',
      tournament: updatedTournament
    });
  } catch (error) {
    console.error('❌ Error joining tournament:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to join tournament',
      error: error.message
    });
  }
});

// Leave tournament
router.post('/leave', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.body;
    const userId = req.user.uid;

    console.log(`🚪 User ${userId} leaving tournament ${tournamentId}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();

    // Check if user is in tournament
    const participantIndex = tournament.participants?.findIndex(p => p.uid === userId);
    if (participantIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'You are not in this tournament'
      });
    }

    // Remove user from tournament
    const updatedParticipants = tournament.participants.filter(p => p.uid !== userId);
    
    await tournamentRef.update({
      participants: updatedParticipants,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ User ${userId} left tournament ${tournamentId}`);

    res.json({
      success: true,
      message: 'Successfully left tournament'
    });
  } catch (error) {
    console.error('❌ Error leaving tournament:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave tournament',
      error: error.message
    });
  }
});

// Start tournament manually
router.post('/:tournamentId/start', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const userId = req.user.uid;

    console.log(`🚀 User ${userId} starting tournament ${tournamentId}`);

    // Get tournament
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();

    // Check if user is a participant
    const isParticipant = tournament.participants?.some(p => p.uid === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Only tournament participants can start the tournament'
      });
    }

    // Check if tournament is ready to start
    if (tournament.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Tournament is not in waiting status'
      });
    }

    if (tournament.participants?.length !== tournament.players) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is not full yet'
      });
    }

    // Validate all participants have sufficient funds before starting
    console.log(`💰 Validating funds for ${tournament.participants.length} participants...`);
    const insufficientFundsUsers = [];
    
    for (const participant of tournament.participants) {
      try {
        const userDoc = await db.collection('users').doc(participant.uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const userBalance = userData.wallet || 0;
          
          if (userBalance < tournament.entryFee) {
            insufficientFundsUsers.push({
              username: participant.username,
              balance: userBalance,
              required: tournament.entryFee
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error checking funds for user ${participant.uid}:`, error);
        insufficientFundsUsers.push({
          username: participant.username,
          balance: 0,
          required: tournament.entryFee,
          error: 'Could not check balance'
        });
      }
    }

    if (insufficientFundsUsers.length > 0) {
      console.log(`❌ Insufficient funds found for ${insufficientFundsUsers.length} participants:`, insufficientFundsUsers);
      return res.status(400).json({
        success: false,
        message: 'Some participants have insufficient funds',
        insufficientFunds: insufficientFundsUsers
      });
    }

    console.log(`✅ All participants have sufficient funds, starting tournament...`);

    // Start the tournament
    const updatedTournament = await checkAndStartTournament(tournamentId);

    res.json({
      success: true,
      message: 'Tournament started successfully',
      tournament: updatedTournament
    });

  } catch (error) {
    console.error('❌ Error starting tournament:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start tournament',
      error: error.message
    });
  }
});

// Get tournament details
router.get('/:tournamentId', authenticateToken, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const userId = req.user.uid;

    console.log(`🔍 Fetching tournament details: ${tournamentId}`);

    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    tournament.id = tournamentDoc.id;

    // Check if user is participant
    const isParticipant = tournament.participants?.some(p => p.uid === userId);

    res.json({
      success: true,
      tournament,
      isParticipant
    });
  } catch (error) {
    console.error('❌ Error fetching tournament details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament details',
      error: error.message
    });
  }
});

// Start match
router.post('/:tournamentId/matches/:matchId/start', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const userId = req.user.uid;

    console.log(`🚀 Starting match ${matchId} in tournament ${tournamentId}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();

    // Find the match
    const match = tournament.bracket?.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    // Initialize startedPlayers if it doesn't exist
    const startedPlayers = match.startedPlayers || [];
    
    // Add current player to started players if not already there
    if (!startedPlayers.includes(userId)) {
      startedPlayers.push(userId);
    }

    // Check if both players have started
    const bothPlayersStarted = startedPlayers.length >= 2;

    // Update match with started players and status
    const updatedBracket = tournament.bracket.map(m => {
      if (m.id === matchId) {
        return {
          ...m,
          startedPlayers,
          status: bothPlayersStarted ? 'ready' : 'pending'
        };
      }
      return m;
    });

    await tournamentRef.update({
      bracket: updatedBracket,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Match ${matchId} updated - startedPlayers: ${startedPlayers.length}/2`);

    res.json({
      success: true,
      message: 'Match started successfully',
      startedPlayers,
      bothPlayersStarted
    });
  } catch (error) {
    console.error('❌ Error starting match:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start match',
      error: error.message
    });
  }
});

// Ready match
router.post('/:tournamentId/matches/:matchId/ready', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const userId = req.user.uid;

    console.log(`✅ Ready for match ${matchId} in tournament ${tournamentId}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();

    // Find the match
    const match = tournament.bracket?.find(m => m.id === matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    // Initialize readyPlayers if it doesn't exist
    const readyPlayers = match.readyPlayers || [];
    
    // Add current player to ready players if not already there
    if (!readyPlayers.includes(userId)) {
      readyPlayers.push(userId);
    }

    // Check if both players are ready
    const bothPlayersReady = readyPlayers.length >= 2;

    // Update match with ready players and status
    const updatedBracket = tournament.bracket.map(m => {
      if (m.id === matchId) {
        return {
          ...m,
          readyPlayers,
          status: bothPlayersReady ? 'in_progress' : 'ready'
        };
      }
      return m;
    });

    await tournamentRef.update({
      bracket: updatedBracket,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Match ${matchId} updated - readyPlayers: ${readyPlayers.length}/2`);

    res.json({
      success: true,
      message: 'Ready status updated successfully',
      readyPlayers,
      bothPlayersReady
    });
  } catch (error) {
    console.error('❌ Error updating ready status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ready status',
      error: error.message
    });
  }
});

// Submit scorecard
router.post('/:tournamentId/matches/:matchId/scorecard', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { player1Score, player2Score } = req.body;
    const userId = req.user.uid;

    console.log(`📊 Submitting scorecard for match ${matchId}: ${player1Score} vs ${player2Score}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    // Determine which player is submitting (player1 or player2)
    const isPlayer1 = match.player1.uid === userId;
    const playerKey = isPlayer1 ? 'player1Scorecard' : 'player2Scorecard';
    const opponentKey = isPlayer1 ? 'player2Scorecard' : 'player1Scorecard';

    // Create scorecard data
    const scorecardData = {
      player1Score: parseInt(player1Score),
      player2Score: parseInt(player2Score),
      submittedBy: userId,
      submittedAt: new Date()
    };

    // Check if this is the first scorecard submission
    const hasExistingScorecard = match[playerKey];
    const hasOpponentScorecard = match[opponentKey];

    let updatedBracket = tournament.bracket.map(m => {
      if (m.id === matchId) {
        const updatedMatch = { ...m };
        
        // Store this player's scorecard
        updatedMatch[playerKey] = scorecardData;
        
        if (!hasOpponentScorecard) {
          // First scorecard submission - start timer
          updatedMatch.status = 'scorecard_waiting';
          updatedMatch.scorecardTimer = {
            startTime: new Date(),
            endTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
            expired: false
          };
          console.log(`⏰ Started 5-minute timer for match ${matchId}`);
        } else {
          // Both scorecards submitted - check for conflicts
          const opponentScorecard = m[opponentKey];
          const hasConflict = (
            scorecardData.player1Score !== opponentScorecard.player1Score ||
            scorecardData.player2Score !== opponentScorecard.player2Score
          );

          if (hasConflict) {
            // Scorecard conflict - move to proof upload phase
            updatedMatch.status = 'scorecard_conflict';
            updatedMatch.conflictDetails = {
              player1Scorecard: isPlayer1 ? scorecardData : opponentScorecard,
              player2Scorecard: isPlayer1 ? opponentScorecard : scorecardData,
              conflictDetectedAt: new Date()
            };
            console.log(`⚠️ Scorecard conflict detected for match ${matchId}`);
          } else {
            // No conflict - determine winner
            const winner = scorecardData.player1Score > scorecardData.player2Score ? match.player1 : match.player2;
            updatedMatch.status = 'completed';
            updatedMatch.winner = winner.uid;
            updatedMatch.finalScorecard = scorecardData;
            console.log(`✅ No conflict - match ${matchId} completed, winner: ${winner.username}`);
            
            // Check if this is the final match (highest round number)
            const maxRound = Math.max(...tournament.bracket.map(m => m.round));
            if (updatedMatch.round === maxRound) {
              console.log('🏆 Final match completed! Tournament winner:', winner.username);
              
              // Update tournament status to completed
              tournament.status = 'completed';
              tournament.winner = winner;
              tournament.completedAt = new Date();
              
              // Calculate and distribute tournament rewards
              const totalEntryFees = tournament.participantsList.length * tournament.entryFee;
              const winnerRewardPercentage = tournament.players <= 4 ? 0.9 : 0.8; // 90% for 4 players or less, 80% for more
              const winnerReward = totalEntryFees * winnerRewardPercentage;
              const adminReward = totalEntryFees - winnerReward;
              
              console.log(`💰 Tournament rewards: Winner gets ${winnerReward} (${winnerRewardPercentage * 100}%), Admin gets ${adminReward} (${(1 - winnerRewardPercentage) * 100}%)`);
              
              // TODO: Implement wallet reward distribution
              // await processTournamentReward(winner.uid, winnerReward, tournamentId);
              // await processTournamentReward('admin', adminReward, tournamentId);
            } else {
              console.log(`🏆 Round ${updatedMatch.round} match completed, checking for next round generation...`);
              
              // Check if all matches in current round are completed
              const currentRoundMatches = tournament.bracket.filter(m => m.round === updatedMatch.round);
              const allCurrentRoundCompleted = currentRoundMatches.every(m => m.status === 'completed');
              
              if (allCurrentRoundCompleted && currentRoundMatches.length > 1) {
                console.log(`🏆 All matches in round ${updatedMatch.round} completed, generating next round...`);
                
                // Generate next round matches
                const nextRoundMatches = generateNextRoundMatches(tournament.bracket, updatedMatch.round);
                tournament.bracket = [...tournament.bracket, ...nextRoundMatches];
                
                console.log(`✅ Next round generated with ${nextRoundMatches.length} matches`);
              }
            }
          }
        }
        
        return updatedMatch;
      }
      return m;
    });

    await tournamentRef.update({
      bracket: updatedBracket,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Scorecard submitted for match ${matchId} by ${isPlayer1 ? 'player1' : 'player2'}`);

    res.json({
      success: true,
      message: 'Scorecard submitted successfully',
      hasConflict: hasOpponentScorecard && (
        scorecardData.player1Score !== m[opponentKey]?.player1Score ||
        scorecardData.player2Score !== m[opponentKey]?.player2Score
      ),
      timerStarted: !hasOpponentScorecard
    });
  } catch (error) {
    console.error('❌ Error submitting scorecard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit scorecard',
      error: error.message
    });
  }
});

// Get scorecard timer status
router.get('/:tournamentId/matches/:matchId/scorecard-timer', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const userId = req.user.uid;

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    const hasTimer = match.scorecardTimer && !match.scorecardTimer.expired;
    let timeRemaining = 0;
    let timerExpired = false;

    if (hasTimer) {
      const now = new Date();
      const endTime = match.scorecardTimer.endTime.toDate ? 
        match.scorecardTimer.endTime.toDate() : 
        new Date(match.scorecardTimer.endTime);
      
      timeRemaining = Math.max(0, endTime.getTime() - now.getTime());
      timerExpired = timeRemaining <= 0;

      // Auto-expire timer if needed
      if (timerExpired && !match.scorecardTimer.expired) {
        const updatedBracket = tournament.bracket.map(m => {
          if (m.id === matchId) {
            return {
              ...m,
              status: 'scorecard_timeout',
              scorecardTimer: { ...m.scorecardTimer, expired: true }
            };
          }
          return m;
        });

        await tournamentRef.update({
          bracket: updatedBracket,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`⏰ Timer expired for match ${matchId}`);
      }
    }

    res.json({
      success: true,
      data: {
        hasTimer,
        timeRemaining,
        timerExpired,
        matchStatus: match.status
      }
    });
  } catch (error) {
    console.error('❌ Error fetching scorecard timer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timer status',
      error: error.message
    });
  }
});

// Get AI timer status for a match
router.get('/:tournamentId/matches/:matchId/ai-timer-status', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const userId = req.user.uid;

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    const hasTimer = match.aiTimer && !match.aiTimer.expired;
    let timeRemaining = 0;
    let timerExpired = false;

    if (hasTimer) {
      const now = new Date();
      const endTime = match.aiTimer.endTime.toDate ? 
        match.aiTimer.endTime.toDate() : 
        new Date(match.aiTimer.endTime);
      
      timeRemaining = Math.max(0, endTime.getTime() - now.getTime());
      timerExpired = timeRemaining <= 0;

      // Auto-expire timer if needed
      if (timerExpired && !match.aiTimer.expired) {
        const updatedBracket = tournament.bracket.map(m => {
          if (m.id === matchId) {
            return {
              ...m,
              status: 'ai_verification',
              aiTimer: { ...m.aiTimer, expired: true }
            };
          }
          return m;
        });

        await tournamentRef.update({
          bracket: updatedBracket,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`⏰ AI timer expired for match ${matchId}`);
      }
    }

    res.json({
      success: true,
      data: {
        hasTimer,
        timeRemaining,
        timerExpired,
        matchStatus: match.status
      }
    });
  } catch (error) {
    console.error('❌ Error fetching AI timer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AI timer status',
      error: error.message
    });
  }
});

// Check and fix match status if needed
router.get('/:tournamentId/matches/:matchId/status-check', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const userId = req.user.uid;

    console.log(`🔍 Checking match status for ${matchId} in tournament ${tournamentId}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    console.log(`🔍 Current match status: ${match.status}`);
    console.log(`🔍 Player 1 scorecard:`, match.player1Scorecard);
    console.log(`🔍 Player 2 scorecard:`, match.player2Scorecard);
    console.log(`🔍 Match scorecard:`, match.scorecard);
    console.log(`🔍 Full match object:`, JSON.stringify(match, null, 2));

    // Check if both scorecards are submitted
    // Handle both old format (player1Scorecard/player2Scorecard) and new format (scorecard)
    const hasPlayer1Scorecard = match.player1Scorecard;
    const hasPlayer2Scorecard = match.player2Scorecard;
    const hasSingleScorecard = match.scorecard;
    
    console.log(`🔍 Has player1 scorecard: ${!!hasPlayer1Scorecard}`);
    console.log(`🔍 Has player2 scorecard: ${!!hasPlayer2Scorecard}`);
    console.log(`🔍 Has single scorecard: ${!!hasSingleScorecard}`);
    console.log(`🔍 Match status is scorecard_submitted: ${match.status === 'scorecard_submitted'}`);
    
    // Check if we have both separate scorecards OR if this is a single scorecard submission that needs processing
    const hasBothScorecards = hasPlayer1Scorecard && hasPlayer2Scorecard;
    const hasSingleScorecardReady = hasSingleScorecard && match.status === 'scorecard_submitted';
    
    console.log(`🔍 Has both scorecards: ${hasBothScorecards}`);
    console.log(`🔍 Has single scorecard ready: ${hasSingleScorecardReady}`);
    console.log(`🔍 Should fix match: ${hasBothScorecards || hasSingleScorecardReady}`);

    // Check if both scorecards are submitted and match needs to progress
    if ((hasBothScorecards || hasSingleScorecardReady) && 
        (match.status === 'scorecard_submitted' || match.status === 'scorecard_waiting')) {
      console.log(`🔧 Fixing match ${matchId} - scorecard(s) submitted but status is scorecard_submitted`);
      
      let newStatus;
      let updatedMatch = { ...match };

      // Handle different scorecard scenarios
      if (hasBothScorecards) {
        // Both players submitted separate scorecards - check for conflicts
        const hasConflict = (
          match.player1Scorecard.player1Score !== match.player2Scorecard.player1Score ||
          match.player1Scorecard.player2Score !== match.player2Scorecard.player2Score
        );

        if (hasConflict) {
          // Scorecard conflict - move to proof upload phase
          newStatus = 'scorecard_conflict';
          updatedMatch.status = newStatus;
          updatedMatch.conflictDetails = {
            player1Scorecard: match.player1Scorecard,
            player2Scorecard: match.player2Scorecard,
            conflictDetectedAt: new Date()
          };
          console.log(`⚠️ Fixed: Scorecard conflict detected for match ${matchId}`);
        } else {
          // No conflict - determine winner
          const winner = match.player1Scorecard.player1Score > match.player1Scorecard.player2Score ? match.player1 : match.player2;
          newStatus = 'completed';
          updatedMatch.status = newStatus;
          updatedMatch.winner = winner.uid;
          updatedMatch.finalScorecard = match.player1Scorecard;
          console.log(`✅ Fixed: No conflict - match ${matchId} completed, winner: ${winner.username}`);
        }
      } else if (hasSingleScorecardReady) {
        // Single scorecard submitted - complete match based on that scorecard
        const scorecard = match.scorecard;
        const winner = scorecard.player1Score > scorecard.player2Score ? match.player1 : match.player2;
        newStatus = 'completed';
        updatedMatch.status = newStatus;
        updatedMatch.winner = winner.uid;
        updatedMatch.finalScorecard = scorecard;
        console.log(`✅ Fixed: Single scorecard - match ${matchId} completed, winner: ${winner.username}`);
      }

      // Continue with tournament progression logic
      if (newStatus === 'completed') {
        // Update next round matches with the winner
        tournament.bracket = updateNextRoundMatches(tournament, updatedMatch);
        
        // Check if this is the final match (highest round number)
        const maxRound = Math.max(...tournament.bracket.map(m => m.round));
        if (updatedMatch.round === maxRound) {
          console.log('🏆 Fixed: Final match completed! Tournament winner:', updatedMatch.winner);
          
          // Update tournament status to completed
          tournament.status = 'completed';
          tournament.winner = updatedMatch.winner;
          tournament.completedAt = new Date();
          
          // Calculate tournament rewards
          const totalEntryFees = tournament.participantsList.length * tournament.entryFee;
          const winnerRewardPercentage = tournament.players <= 4 ? 0.9 : 0.8;
          const winnerReward = totalEntryFees * winnerRewardPercentage;
          const adminReward = totalEntryFees - winnerReward;
          
          console.log(`💰 Fixed: Tournament rewards: Winner gets ${winnerReward} (${winnerRewardPercentage * 100}%), Admin gets ${adminReward} (${(1 - winnerRewardPercentage) * 100}%)`);
        } else {
          console.log(`🏆 Fixed: Round ${updatedMatch.round} match completed, checking for next round generation...`);
          
          // Check if all matches in current round are completed
          const currentRoundMatches = tournament.bracket.filter(m => m.round === updatedMatch.round);
          const allCurrentRoundCompleted = currentRoundMatches.every(m => m.status === 'completed');
          
          console.log(`🔍 Current round matches:`, currentRoundMatches.map(m => ({ id: m.id, status: m.status, round: m.round })));
          console.log(`🔍 All current round completed: ${allCurrentRoundCompleted}`);
          console.log(`🔍 Current round matches length: ${currentRoundMatches.length}`);
          
          if (allCurrentRoundCompleted && currentRoundMatches.length > 1) {
            console.log(`🏆 Fixed: All matches in round ${updatedMatch.round} completed, generating next round...`);
            
            // Generate next round matches
            const nextRoundMatches = generateNextRoundMatches(tournament.bracket, updatedMatch.round);
            tournament.bracket = [...tournament.bracket, ...nextRoundMatches];
            
            console.log(`✅ Fixed: Next round generated with ${nextRoundMatches.length} matches`);
            console.log(`🔍 Next round matches:`, nextRoundMatches.map(m => ({ id: m.id, round: m.round, player1: m.player1.username, player2: m.player2.username })));
          } else {
            console.log(`⏳ Waiting for other matches in round ${updatedMatch.round} to complete...`);
          }
        }
      }

      // Update the tournament
      const updatedBracket = tournament.bracket.map(m => m.id === matchId ? updatedMatch : m);
      
      await tournamentRef.update({
        bracket: updatedBracket,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.json({
        success: true,
        message: `Match status fixed from scorecard_submitted to ${newStatus}`,
        match: updatedMatch
      });
    }

    return res.json({
      success: true,
      message: 'Match status is correct',
      match: match
    });

  } catch (error) {
    console.error('❌ Error checking match status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check match status',
      error: error.message
    });
  }
});

// Upload proof for AI verification
router.post('/:tournamentId/matches/:matchId/upload-proof', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { proofImages, proofDescription } = req.body;
    const userId = req.user.uid;

    console.log(`📸 Uploading proof for match ${matchId} in tournament ${tournamentId}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    // Debug: Log the actual match status and structure
    console.log('🔍 Upload proof debug - Match status:', match.status);
    console.log('🔍 Upload proof debug - Match status type:', typeof match.status);
    console.log('🔍 Upload proof debug - Full match object:', JSON.stringify(match, null, 2));

    // Check if match is in a state that allows proof upload (only when there's a conflict)
    if (!['scorecard_conflict', 'ai_verification_waiting'].includes(match.status)) {
      console.log('❌ Upload proof rejected - Match status is:', match.status, 'Expected: scorecard_conflict or ai_verification_waiting');
      return res.status(400).json({
        success: false,
        message: 'Proof upload is only allowed when there is a scorecard conflict'
      });
    }

    // Determine which player is uploading proof
    const isPlayer1 = match.player1.uid === userId;
    const playerKey = isPlayer1 ? 'player1Proof' : 'player2Proof';
    const opponentKey = isPlayer1 ? 'player2Proof' : 'player1Proof';

    // Create proof data
    const proofData = {
      proofImages,
      proofDescription,
      uploadedBy: userId,
      uploadedAt: new Date()
    };

    const hasOpponentProof = match[opponentKey];

    let updatedBracket = tournament.bracket.map(m => {
      if (m.id === matchId) {
        const updatedMatch = { ...m };
        
        // Store this player's proof
        updatedMatch[playerKey] = proofData;
        
        if (!hasOpponentProof) {
          // First proof upload - start AI timer
          updatedMatch.status = 'ai_verification_waiting';
          updatedMatch.aiTimer = {
            startTime: new Date(),
            endTime: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
            expired: false
          };
          console.log(`⏰ Started 5-minute AI timer for match ${matchId}`);
        } else {
          // Both proofs uploaded - start AI analysis
          updatedMatch.status = 'ai_verification';
          console.log(`🤖 Starting AI analysis for match ${matchId}`);
        }
        
        return updatedMatch;
      }
      return m;
    });

    await tournamentRef.update({
      bracket: updatedBracket,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Proof uploaded for match ${matchId} by ${isPlayer1 ? 'player1' : 'player2'}`);

    res.json({
      success: true,
      message: 'Proof uploaded successfully',
      timerStarted: !hasOpponentProof,
      aiAnalysisStarted: hasOpponentProof
    });
  } catch (error) {
    console.error('❌ Error uploading proof:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload proof',
      error: error.message
    });
  }
});

// AI verification for match (analyze proofs)
router.post('/:tournamentId/matches/:matchId/ai-claim', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const userId = req.user.uid;

    console.log(`🤖 Starting AI analysis for match ${matchId} in tournament ${tournamentId}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is in this match
    const isInMatch = match.player1.uid === userId || match.player2.uid === userId;
    if (!isInMatch) {
      return res.status(403).json({
        success: false,
        message: 'You are not in this match'
      });
    }

    // Check if both proofs are uploaded
    if (!match.player1Proof || !match.player2Proof) {
      return res.status(400).json({
        success: false,
        message: 'Both players must upload proof before AI analysis'
      });
    }

    // Import the AI analysis function from challenges
    const { performAIAnalysis } = require('./challenges');
    
    // Create challenge-like data for AI analysis
    const challengeData = {
      game: 'Tournament Match',
      platform: 'Tournament',
      challenger: match.player1.username,
      opponents: [{ username: match.player2.username }]
    };

    // Get platform usernames (use player usernames for tournament)
    const platformUsernames = {
      [match.player1.username]: match.player1.username,
      [match.player2.username]: match.player2.username
    };

    // Combine both proofs for AI analysis
    const allProofImages = [
      ...(match.player1Proof.proofImages || []),
      ...(match.player2Proof.proofImages || [])
    ];

    const proofDescription = `Player 1 (${match.player1.username}): ${match.player1Proof.proofDescription || 'No description'}\nPlayer 2 (${match.player2.username}): ${match.player2Proof.proofDescription || 'No description'}`;

    // Perform AI analysis
    const aiResult = await performAIAnalysis(challengeData, allProofImages, proofDescription, platformUsernames);

    // Determine winner based on AI result
    let winner;
    if (aiResult.winner === match.player1.username) {
      winner = match.player1;
    } else if (aiResult.winner === match.player2.username) {
      winner = match.player2;
    } else {
      // AI couldn't determine winner - use first proof uploader as winner
      winner = match.player1Proof.uploadedBy === match.player1.uid ? match.player1 : match.player2;
      aiResult.reasoning = 'AI analysis inconclusive. Winner determined by first proof uploader.';
      aiResult.confidence = 0.5;
    }

    // Update match with AI result
    const updatedBracket = tournament.bracket.map(m => 
      m.id === matchId ? { 
        ...m, 
        status: 'completed',
        winner: winner.uid,
        aiResult,
        aiVerifiedAt: new Date()
      } : m
    );

    await tournamentRef.update({
      bracket: updatedBracket,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ AI verification completed for match ${matchId}, winner: ${winner.username}`);

    // Check if round is complete and advance
    await checkAndAdvanceRound(tournamentId, match.round);

    res.json({
      success: true,
      message: 'AI verification completed',
      winner: winner.username,
      aiResult
    });
  } catch (error) {
    console.error('❌ Error in AI verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process AI verification',
      error: error.message
    });
  }
});

// Submit dispute for tournament match result
router.post('/:tournamentId/matches/:matchId/dispute', authenticateToken, async (req, res) => {
  try {
    const { tournamentId, matchId } = req.params;
    const { reason, evidence } = req.body;
    const userId = req.user.uid;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required for dispute'
      });
    }

    console.log(`🎯 Submitting dispute for tournament match ${matchId} in tournament ${tournamentId}`);
    console.log(`🎯 Reason: ${reason}`);

    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }

    const tournament = tournamentDoc.data();
    const match = tournament.bracket?.find(m => m.id === matchId);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    // Check if user is part of this match
    const isPlayer1 = match.player1.uid === userId;
    const isPlayer2 = match.player2.uid === userId;

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to dispute this match'
      });
    }

    // Check if match is completed
    if (match.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only dispute completed matches'
      });
    }

    // Create dispute record
    const disputeData = {
      tournamentId,
      matchId,
      player1Username: match.player1.username,
      player2Username: match.player2.username,
      disputingPlayerUsername: req.user.username,
      reason,
      evidence: evidence || '',
      submittedAt: new Date(),
      status: 'pending', // pending, reviewed, resolved
      adminNotes: '',
      resolvedAt: null,
      resolution: null // revert_result, keep_result, draw
    };

    // Add to disputes collection
    const disputeRef = await db.collection('disputes').add(disputeData);
    
    // Update match status to disputed
    const updatedBracket = tournament.bracket.map(m => 
      m.id === matchId ? { 
        ...m, 
        status: 'disputed',
        disputeId: disputeRef.id
      } : m
    );

    await tournamentRef.update({
      bracket: updatedBracket,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Dispute submitted successfully for match ${matchId}: ${disputeRef.id}`);

    res.json({
      success: true,
      message: 'Dispute submitted successfully',
      data: {
        disputeId: disputeRef.id,
        tournamentId,
        matchId,
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

// Helper function to create new tournament
async function createNewTournament(type, config) {
  try {
    const tournamentData = {
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Championship`,
      players: config.players,
      entryFee: config.entryFee,
      winnerReward: config.winnerReward,
      adminReward: config.adminReward,
      status: 'waiting',
      participants: [],
      bracket: null,
      currentRound: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const tournamentRef = await db.collection('tournaments').add(tournamentData);
    const tournament = { ...tournamentData, id: tournamentRef.id };
    
    console.log(`✅ Created new ${type} tournament:`, tournament.id);
    return tournament;
  } catch (error) {
    console.error(`❌ Error creating ${type} tournament:`, error);
    throw error;
  }
}

// Helper function to remove user from other tournaments
async function removeUserFromOtherTournaments(userId, tournamentType) {
  try {
    console.log(`🔍 Searching for other ${tournamentType} tournaments...`);
    const otherTournamentsQuery = await db.collection('tournaments')
      .where('type', '==', tournamentType)
      .where('status', 'in', ['waiting', 'starting'])
      .get();

    console.log(`📊 Found ${otherTournamentsQuery.docs.length} other tournaments`);
    const batch = db.batch();

    otherTournamentsQuery.docs.forEach(doc => {
      const tournament = doc.data();
      const updatedParticipants = tournament.participants?.filter(p => p.uid !== userId) || [];
      
      batch.update(doc.ref, {
        participants: updatedParticipants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    if (otherTournamentsQuery.docs.length > 0) {
      await batch.commit();
      console.log(`✅ Removed user ${userId} from other ${tournamentType} tournaments`);
    } else {
      console.log(`ℹ️ No other ${tournamentType} tournaments to remove user from`);
    }
  } catch (error) {
    console.error('❌ Error removing user from other tournaments:', error);
    throw error;
  }
}

// Helper function to check and start tournament
async function checkAndStartTournament(tournamentId) {
  try {
    console.log(`🔍 Checking tournament ${tournamentId}...`);
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.data();

    console.log(`📊 Tournament has ${tournament.participants?.length || 0}/${tournament.players} participants`);
    
    if (tournament.participants?.length === tournament.players) {
      console.log(`🚀 Starting tournament ${tournamentId} with ${tournament.participants.length} participants`);

      // Deduct entry fees from all participants
      console.log(`💰 Processing entry fees for ${tournament.participants.length} participants...`);
      for (const participant of tournament.participants) {
        console.log(`💳 Processing entry fee for participant ${participant.uid}...`);
        await processTournamentEntry(participant.uid, tournament.entryFee, tournamentId);
      }

      // Generate bracket
      const bracket = generateTournamentBracket(tournament.participants);

    // Update tournament status
    await tournamentRef.update({
      status: 'in_progress',
      bracket,
      currentRound: 1,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Tournament ${tournamentId} started with bracket generated`);

    // Send push notification to all participants
    try {
      console.log(`📱 Sending tournament ready notification to ${tournament.participants.length} participants...`);
      const participantIds = tournament.participants.map(p => p.uid);
      await notificationService.sendTournamentReadyNotification({
        id: tournamentId,
        name: tournament.name,
        type: tournament.type,
        players: tournament.players,
        entryFee: tournament.entryFee
      }, participantIds);
      console.log(`✅ Tournament ready notification sent successfully`);
    } catch (notificationError) {
      console.error('⚠️ Failed to send tournament ready notification:', notificationError.message);
      // Don't fail the tournament start if notification fails
    }

    return {
      ...tournament,
      id: tournamentId,
      status: 'in_progress',
      bracket,
      currentRound: 1
    };
    }

    return tournament;
  } catch (error) {
    console.error('❌ Error starting tournament:', error);
    throw error;
  }
}

// Helper function to generate tournament bracket
function generateTournamentBracket(participants) {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const matches = [];
  let matchId = 1;
  let round = 1;
  let currentRoundParticipants = shuffled;

  while (currentRoundParticipants.length > 1) {
    const roundMatches = [];
    
    for (let i = 0; i < currentRoundParticipants.length; i += 2) {
      if (i + 1 < currentRoundParticipants.length) {
        roundMatches.push({
          id: `match_${matchId}`,
          round,
          matchNumber: Math.floor(i / 2) + 1,
          player1: currentRoundParticipants[i],
          player2: currentRoundParticipants[i + 1],
          status: 'pending',
          winner: null,
          scorecard: null,
          aiResult: null,
          proof: {}
        });
        matchId++;
      }
    }
    
    matches.push(...roundMatches);
    
    // Calculate winners for next round
    const nextRoundParticipants = [];
    for (let i = 0; i < currentRoundParticipants.length; i += 2) {
      if (i + 1 < currentRoundParticipants.length) {
        nextRoundParticipants.push({
          uid: `winner_${round}_${Math.floor(i / 2)}`,
          username: `Winner of Round ${round} Match ${Math.floor(i / 2) + 1}`,
          level: Math.floor(Math.random() * 50) + 20
        });
      }
    }
    
    currentRoundParticipants = nextRoundParticipants;
    round++;
  }

  return matches;
}

// Helper function to check and advance round
async function checkAndAdvanceRound(tournamentId, completedRound) {
  try {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    const tournament = tournamentDoc.data();

    const roundMatches = tournament.bracket?.filter(m => m.round === completedRound) || [];
    const allComplete = roundMatches.every(m => m.status === 'completed');

    if (allComplete) {
      console.log(`🎉 Round ${completedRound} complete, advancing to next round`);

      const nextRound = completedRound + 1;
      const nextRoundMatches = tournament.bracket?.filter(m => m.round === nextRound) || [];

      if (nextRoundMatches.length > 0) {
        // Update next round matches to pending
        const updatedBracket = tournament.bracket.map(match => 
          match.round === nextRound ? { ...match, status: 'pending' } : match
        );

        // Update final match with real winners
        if (completedRound === 1 && nextRound === 2) {
          const round1Matches = tournament.bracket.filter(m => m.round === 1);
          const winners = round1Matches.map(match => {
            const winner = match.winner === match.player1.uid ? match.player1 : match.player2;
            return {
              uid: winner.uid,
              username: winner.username,
              level: Math.floor(Math.random() * 50) + 20
            };
          });

          if (winners.length >= 2) {
            const finalUpdatedBracket = updatedBracket.map(match => 
              match.round === nextRound ? {
                ...match,
                player1: winners[0],
                player2: winners[1]
              } : match
            );

            await tournamentRef.update({
              bracket: finalUpdatedBracket,
              currentRound: nextRound,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`✅ Final match updated with real winners`);
          }
        } else {
          await tournamentRef.update({
            bracket: updatedBracket,
            currentRound: nextRound,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      } else {
        // Tournament complete
        console.log(`🏆 Tournament ${tournamentId} completed!`);
        
        const finalMatch = roundMatches[0];
        const winner = finalMatch.winner === finalMatch.player1.uid ? finalMatch.player1 : finalMatch.player2;
        
        // Process tournament rewards
        await processTournamentReward(tournamentId, winner.uid, tournament);

        await tournamentRef.update({
          status: 'completed',
          winner: winner,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`🎉 Tournament winner: ${winner.username}`);
      }
    }
  } catch (error) {
    console.error('❌ Error advancing round:', error);
    throw error;
  }
}

module.exports = router;
