const express = require('express');
const { firestore } = require('../config/firebase');
const { authenticateToken } = require('../middleware/auth');
const { ensureAdmin } = require('../middleware/userAccess');

const router = express.Router();

// Collection reference
const COLLECTION_NAME = 'games';

// Helpers
const normalizeGameName = (name) => (name || '').trim();

// Create a new game (auto-generate unique integer id)
router.post('/', authenticateToken, ensureAdmin, async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ success: false, message: 'Firestore is not configured' });
    }

    const { gameName, isPublic } = req.body || {};

    if (!gameName) {
      return res.status(400).json({ success: false, message: 'gameName is required' });
    }

    const normalizedName = normalizeGameName(gameName);
    const lowerName = normalizedName.toLowerCase();

    const now = Date.now();

    // Use transaction to ensure unique name and atomic id allocation
    let createdPayload = null;
    await firestore.runTransaction(async (tx) => {
      // Unique name guard using name index collection
      const nameRef = firestore.collection('game_names').doc(lowerName);
      const nameDoc = await tx.get(nameRef);
      if (nameDoc.exists) {
        const error = new Error('DUPLICATE_NAME');
        // Attach custom code for outer catch
        error.code = 'DUPLICATE_NAME';
        throw error;
      }

      // Counter for integer id
      const counterRef = firestore.collection('counters').doc('games');
      const counterDoc = await tx.get(counterRef);
      const lastId = counterDoc.exists ? Number(counterDoc.data().lastId) : 1000;
      const nextId = lastId + 1;

      // Create game payload
      const payload = {
        id: nextId,
        gameName: normalizedName,
        gameNameLower: lowerName,
        isPublic: Boolean(isPublic),
        createdAt: now,
        updatedAt: now
      };

      // Write updates atomically
      const gameRef = firestore.collection(COLLECTION_NAME).doc(String(nextId));
      tx.set(counterRef, { lastId: nextId }, { merge: true });
      tx.set(nameRef, { id: nextId, gameName: normalizedName, createdAt: now });
      tx.set(gameRef, payload);

      createdPayload = payload;
    });

    return res.status(201).json({ success: true, data: createdPayload });
  } catch (error) {
    if (error && (error.code === 'DUPLICATE_NAME' || error.message === 'DUPLICATE_NAME')) {
      return res.status(409).json({ success: false, message: 'gameName already exists' });
    }
    console.error('Error creating game:', error);
    return res.status(500).json({ success: false, message: 'Failed to create game', error: error.message });
  }
});

// Update an existing game by id
router.put('/:id', authenticateToken, ensureAdmin, async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ success: false, message: 'Firestore is not configured' });
    }

    const { id } = req.params;
    const { gameName, isPublic } = req.body || {};

    const idNum = Number(id);
    if (!Number.isInteger(idNum)) {
      return res.status(400).json({ success: false, message: 'id param must be an integer' });
    }

    const docRef = firestore.collection(COLLECTION_NAME).doc(String(idNum));
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    const updates = { updatedAt: Date.now() };

    const current = doc.data();

    if (typeof gameName === 'string') {
      const normalizedName = normalizeGameName(gameName);
      const lowerName = normalizedName.toLowerCase();

      if (lowerName !== current.gameNameLower) {
        // Transactionally rename name index and update document
        try {
          await firestore.runTransaction(async (tx) => {
            const newNameRef = firestore.collection('game_names').doc(lowerName);
            const oldNameRef = firestore.collection('game_names').doc(current.gameNameLower);
            const newNameDoc = await tx.get(newNameRef);
            if (newNameDoc.exists) {
              const err = new Error('DUPLICATE_NAME');
              err.code = 'DUPLICATE_NAME';
              throw err;
            }
            tx.set(newNameRef, { id: current.id, gameName: normalizedName, createdAt: current.createdAt || Date.now() });
            tx.delete(oldNameRef);
            tx.update(docRef, { gameName: normalizedName, gameNameLower: lowerName, updatedAt: Date.now() });
          });
        } catch (e) {
          if (e && (e.code === 'DUPLICATE_NAME' || e.message === 'DUPLICATE_NAME')) {
            return res.status(409).json({ success: false, message: 'gameName already exists' });
          }
          throw e;
        }
      } else {
        updates.gameName = normalizedName;
        updates.gameNameLower = lowerName;
      }
    }

    if (typeof isPublic === 'boolean') {
      updates.isPublic = isPublic;
    }

    if (Object.keys(updates).length > 1 || (Object.keys(updates).length === 1 && !('updatedAt' in updates))) {
      await docRef.update(updates);
    }

    const updated = await docRef.get();
    return res.json({ success: true, data: updated.data() });
  } catch (error) {
    console.error('Error updating game:', error);
    return res.status(500).json({ success: false, message: 'Failed to update game', error: error.message });
  }
});

// Delete a game by id
router.delete('/:id', authenticateToken, ensureAdmin, async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ success: false, message: 'Firestore is not configured' });
    }

    const { id } = req.params;
    const idNum = Number(id);
    if (!Number.isInteger(idNum)) {
      return res.status(400).json({ success: false, message: 'id param must be an integer' });
    }

    const docRef = firestore.collection(COLLECTION_NAME).doc(String(idNum));
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    // Transactionally delete game and its name index
    await firestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(docRef);
      if (!snapshot.exists) {
        throw new Error('NOT_FOUND');
      }
      const data = snapshot.data();
      const nameRef = firestore.collection('game_names').doc(data.gameNameLower);
      tx.delete(nameRef);
      tx.delete(docRef);
    });
    return res.json({ success: true, message: 'Game deleted' });
  } catch (error) {
    console.error('Error deleting game:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete game', error: error.message });
  }
});

// List games (optionally filter by isPublic=true)
router.get('/', async (req, res) => {
  try {
    if (!firestore) {
      return res.status(503).json({ success: false, message: 'Firestore is not configured' });
    }

    const { publicOnly } = req.query;
    let query = firestore.collection(COLLECTION_NAME);
    if (String(publicOnly).toLowerCase() === 'true') {
      query = query.where('isPublic', '==', true);
    }

    let games = [];
    try {
      const snap = await query.orderBy('gameNameLower').get();
      snap.forEach((doc) => games.push(doc.data()));
    } catch (orderError) {
      console.warn('⚠️ Falling back to unsorted fetch for games:', orderError.message);
      const snap = await query.get();
      snap.forEach((doc) => games.push(doc.data()));
      games.sort((a, b) => (a.gameNameLower || '').localeCompare(b.gameNameLower || ''));
    }

    return res.json({ success: true, data: games });
  } catch (error) {
    console.error('Error listing games:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch games', error: error.message });
  }
});

module.exports = router;


