const { firestore } = require('../config/firebase');

class DisputeService {
  // Create a new dispute
  async createDispute(disputeData) {
    try {
      const dispute = {
        ...disputeData,
        id: `dispute_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const ref = await firestore.collection('disputes').add(dispute);
      // Persist the Firestore doc id too for future-safe lookups
      await ref.update({ docId: ref.id });
      
      console.log(`✅ Dispute created: ${dispute.id} for challenge ${dispute.challengeId}`);
      return dispute;
    } catch (error) {
      console.error('Error creating dispute:', error);
      throw error;
    }
  }

  // Get all disputes (for admin)
  async getAllDisputes() {
    try {
      const disputesRef = firestore.collection('disputes')
        .orderBy('createdAt', 'desc');
      
      const snapshot = await disputesRef.get();
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id, legacyId: data.id };
      });
    } catch (error) {
      console.error('Error getting all disputes:', error);
      throw error;
    }
  }

  // Get disputes by user
  async getUserDisputes(userId) {
    try {
      // Avoid composite index requirement by doing two simple filters without orderBy, then sort in memory
      const challengerSnap = await firestore.collection('disputes')
        .where('challengerId', '==', userId)
        .get();
      const opponentSnap = await firestore.collection('disputes')
        .where('opponentId', '==', userId)
        .get();

      const toArray = (snap) => snap.docs.map(doc => { const data = doc.data(); return ({ ...data, id: doc.id, legacyId: data.id }); });
      const allDisputes = [...toArray(challengerSnap), ...toArray(opponentSnap)];
      return allDisputes.sort((a, b) => {
        const aTime = (a.createdAt?.toDate?.() || new Date(a.createdAt || 0)).getTime?.() || 0;
        const bTime = (b.createdAt?.toDate?.() || new Date(b.createdAt || 0)).getTime?.() || 0;
        return bTime - aTime;
      });
    } catch (error) {
      console.error('Error getting user disputes:', error);
      throw error;
    }
  }

  // Get dispute by ID
  async getDisputeById(disputeId) {
    try {
      const disputeRef = firestore.collection('disputes').doc(disputeId);
      const disputeDoc = await disputeRef.get();
      
      if (!disputeDoc.exists) {
        // Fallback: look up by legacy `id` field
        const q = await firestore.collection('disputes').where('id', '==', disputeId).limit(1).get();
        if (q.empty) return null;
        const doc = q.docs[0];
        return { ...doc.data(), id: doc.id };
      }
      
      return { ...disputeDoc.data(), id: disputeDoc.id };
    } catch (error) {
      console.error('Error getting dispute by ID:', error);
      throw error;
    }
  }

  // Update dispute status (for admin)
  async updateDisputeStatus(disputeId, status, adminNotes) {
    try {
      let docRef = firestore.collection('disputes').doc(disputeId);
      let docSnap = await docRef.get();
      if (!docSnap.exists) {
        // Fallback to legacy id field
        const q = await firestore.collection('disputes').where('id', '==', disputeId).limit(1).get();
        if (!q.empty) {
          docRef = q.docs[0].ref;
        }
      }
      await docRef.update({ status, adminNotes, updatedAt: new Date() });
      
      console.log(`✅ Dispute ${disputeId} status updated to: ${status}`);
    } catch (error) {
      console.error('Error updating dispute status:', error);
      throw error;
    }
  }

  // Resolve dispute (for admin)
  async resolveDispute(disputeId, resolution, resolvedBy, adminNotes) {
    try {
      let docRef = firestore.collection('disputes').doc(disputeId);
      let docSnap = await docRef.get();
      if (!docSnap.exists) {
        const q = await firestore.collection('disputes').where('id', '==', disputeId).limit(1).get();
        if (!q.empty) {
          docRef = q.docs[0].ref;
        }
      }
      await docRef.update({ status: 'resolved', resolution, resolvedBy, resolvedAt: new Date(), adminNotes, updatedAt: new Date() });
      
      console.log(`✅ Dispute ${disputeId} resolved with resolution: ${resolution}`);
    } catch (error) {
      console.error('Error resolving dispute:', error);
      throw error;
    }
  }

  // Get dispute statistics (for admin dashboard)
  async getDisputeStats() {
    try {
      const disputesRef = firestore.collection('disputes');
      const snapshot = await disputesRef.get();
      
      const disputes = snapshot.docs.map(doc => doc.data());
      
      return {
        total: disputes.length,
        pending: disputes.filter(d => d.status === 'pending').length,
        underReview: disputes.filter(d => d.status === 'under_review').length,
        resolved: disputes.filter(d => d.status === 'resolved').length,
        dismissed: disputes.filter(d => d.status === 'dismissed').length
      };
    } catch (error) {
      console.error('Error getting dispute stats:', error);
      throw error;
    }
  }

  // Check if user has active disputes for a challenge
  async hasActiveDispute(challengeId, userId) {
    try {
      const disputesRef = firestore.collection('disputes')
        .where('challengeId', '==', challengeId)
        .where('status', 'in', ['pending', 'under_review']);
      
      const snapshot = await disputesRef.get();
      
      return snapshot.docs.some(doc => {
        const dispute = doc.data();
        return dispute.challengerId === userId || dispute.opponentId === userId;
      });
    } catch (error) {
      console.error('Error checking active disputes:', error);
      throw error;
    }
  }
}

module.exports = { DisputeService };
