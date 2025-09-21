const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { authenticateToken } = require('../middleware/auth');

const db = admin.firestore();

// Middleware to check if user is admin (same as admin portal)
const requireAdmin = async (req, res, next) => {
  try {
    // Accept either explicit isAdmin flag or username 'admin'
    const isAdmin = Boolean(req.user?.isAdmin) || (req.user?.username || '').toLowerCase() === 'admin';
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
};

// Get all tournament types (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tournamentTypesSnapshot = await db.collection('tournamentTypes')
      .orderBy('createdAt', 'desc')
      .get();

    const tournamentTypes = [];
    tournamentTypesSnapshot.forEach(doc => {
      tournamentTypes.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      success: true,
      tournamentTypes
    });
  } catch (error) {
    console.error('❌ Error fetching tournament types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament types',
      error: error.message
    });
  }
});

// Get active tournament types (public)
router.get('/active', async (req, res) => {
  try {
    console.log('🔍 Fetching active tournament types...');
    
    // Try the optimized query first
    let tournamentTypesSnapshot;
    try {
      tournamentTypesSnapshot = await db.collection('tournamentTypes')
        .where('isActive', '==', true)
        .orderBy('displayOrder', 'asc')
        .get();
    } catch (indexError) {
      console.log('⚠️ Index error, falling back to simple query:', indexError.message);
      // Fallback to simple query without orderBy
      tournamentTypesSnapshot = await db.collection('tournamentTypes')
        .where('isActive', '==', true)
        .get();
    }

    const tournamentTypes = [];
    tournamentTypesSnapshot.forEach(doc => {
      const data = doc.data();
      tournamentTypes.push({
        id: doc.id,
        ...data
      });
    });

    // Sort by displayOrder if we have it
    tournamentTypes.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    console.log('✅ Found tournament types:', tournamentTypes.length);
    
    // If no tournament types found, return empty array instead of error
    if (tournamentTypes.length === 0) {
      console.log('⚠️ No active tournament types found in database');
    }
    
    res.json({
      success: true,
      tournamentTypes
    });
  } catch (error) {
    console.error('❌ Error fetching active tournament types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active tournament types',
      error: error.message
    });
  }
});

// Create new tournament type (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      key,
      players,
      entryFee,
      winnerReward,
      adminReward,
      description,
      icon,
      color,
      displayOrder,
      isActive = true
    } = req.body;


    // Validate required fields
    if (!name || !key || !players || !entryFee || winnerReward === undefined || adminReward === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, key, players, entryFee, winnerReward, adminReward'
      });
    }

    // Check if key already exists
    const existingType = await db.collection('tournamentTypes')
      .where('key', '==', key)
      .get();

    if (!existingType.empty) {
      return res.status(400).json({
        success: false,
        message: 'Tournament type with this key already exists'
      });
    }

    // Validate reward percentages
    if (winnerReward + adminReward !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Winner reward and admin reward must sum to 1.0 (100%)'
      });
    }

    const tournamentTypeData = {
      name,
      key,
      players: parseInt(players),
      entryFee: parseFloat(entryFee),
      winnerReward: parseFloat(winnerReward),
      adminReward: parseFloat(adminReward),
      description: description || '',
      icon: icon || '⚔️',
      color: color || 'bg-primary',
      displayOrder: parseInt(displayOrder) || 0,
      isActive: Boolean(isActive),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.user.uid
    };

    const docRef = await db.collection('tournamentTypes').add(tournamentTypeData);
    

    res.status(201).json({
      success: true,
      message: 'Tournament type created successfully',
      tournamentType: {
        id: docRef.id,
        ...tournamentTypeData
      }
    });
  } catch (error) {
    console.error('❌ Error creating tournament type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tournament type',
      error: error.message
    });
  }
});

// Update tournament type (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;


    // Validate reward percentages if provided
    if (updateData.winnerReward !== undefined && updateData.adminReward !== undefined) {
      if (updateData.winnerReward + updateData.adminReward !== 1) {
        return res.status(400).json({
          success: false,
          message: 'Winner reward and admin reward must sum to 1.0 (100%)'
        });
      }
    }

    // Check if key already exists (if changing key)
    if (updateData.key) {
      const existingType = await db.collection('tournamentTypes')
        .where('key', '==', updateData.key)
        .get();

      const isDifferentDoc = existingType.docs.some(doc => doc.id !== id);
      if (isDifferentDoc) {
        return res.status(400).json({
          success: false,
          message: 'Tournament type with this key already exists'
        });
      }
    }

    // Prepare update data
    const allowedFields = [
      'name', 'key', 'players', 'entryFee', 'winnerReward', 'adminReward',
      'description', 'icon', 'color', 'displayOrder', 'isActive'
    ];

    const filteredData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        if (field === 'players' || field === 'displayOrder') {
          filteredData[field] = parseInt(updateData[field]);
        } else if (field === 'entryFee' || field === 'winnerReward' || field === 'adminReward') {
          filteredData[field] = parseFloat(updateData[field]);
        } else if (field === 'isActive') {
          filteredData[field] = Boolean(updateData[field]);
        } else {
          filteredData[field] = updateData[field];
        }
      }
    });

    filteredData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    filteredData.updatedBy = req.user.uid;

    await db.collection('tournamentTypes').doc(id).update(filteredData);


    res.json({
      success: true,
      message: 'Tournament type updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating tournament type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tournament type',
      error: error.message
    });
  }
});

// Toggle tournament type active status (admin only)
router.patch('/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;


    const tournamentTypeRef = db.collection('tournamentTypes').doc(id);
    const tournamentTypeDoc = await tournamentTypeRef.get();

    if (!tournamentTypeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament type not found'
      });
    }

    const currentData = tournamentTypeDoc.data();
    const newStatus = !currentData.isActive;

    await tournamentTypeRef.update({
      isActive: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid
    });


    res.json({
      success: true,
      message: `Tournament type ${newStatus ? 'activated' : 'deactivated'} successfully`,
      isActive: newStatus
    });
  } catch (error) {
    console.error('❌ Error toggling tournament type status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle tournament type status',
      error: error.message
    });
  }
});

// Delete tournament type (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;


    // Check if tournament type exists
    const tournamentTypeDoc = await db.collection('tournamentTypes').doc(id).get();
    if (!tournamentTypeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament type not found'
      });
    }

    // Check if there are any active tournaments of this type
    const activeTournaments = await db.collection('tournaments')
      .where('type', '==', tournamentTypeDoc.data().key)
      .where('status', 'in', ['waiting', 'starting', 'in_progress'])
      .get();

    if (!activeTournaments.empty) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tournament type with active tournaments'
      });
    }

    await db.collection('tournamentTypes').doc(id).delete();


    res.json({
      success: true,
      message: 'Tournament type deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting tournament type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tournament type',
      error: error.message
    });
  }
});

// Get tournament type by ID (admin only)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;


    const tournamentTypeDoc = await db.collection('tournamentTypes').doc(id).get();

    if (!tournamentTypeDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Tournament type not found'
      });
    }

    res.json({
      success: true,
      tournamentType: {
        id: tournamentTypeDoc.id,
        ...tournamentTypeDoc.data()
      }
    });
  } catch (error) {
    console.error('❌ Error fetching tournament type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament type',
      error: error.message
    });
  }
});

module.exports = router;
