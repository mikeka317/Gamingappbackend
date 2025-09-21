const admin = require('firebase-admin');

class NotificationService {
  constructor() {
    this.messaging = admin.messaging();
  }

  /**
   * Send push notification to multiple users
   * @param {Array} userIds - Array of user IDs to send notifications to
   * @param {Object} notification - Notification payload
   * @param {Object} data - Additional data payload
   */
  async sendToUsers(userIds, notification, data = {}) {
    try {
      console.log(`📱 Sending notification to ${userIds.length} users:`, notification.title);
      
      // Get FCM tokens for all users
      const tokens = await this.getUserTokens(userIds);
      
      if (tokens.length === 0) {
        console.log('⚠️ No FCM tokens found for users');
        return { success: false, message: 'No FCM tokens found' };
      }

      // Send notification to all tokens
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon || '/icon-192x192.png',
          badge: notification.badge || '/badge-72x72.png'
        },
        data: {
          ...data,
          click_action: notification.click_action || 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens: tokens
      };

      const response = await this.messaging().sendMulticast(message);
      
      console.log(`✅ Notification sent successfully:`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      });

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      };

    } catch (error) {
      console.error('❌ Error sending notification:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get FCM tokens for multiple users
   * @param {Array} userIds - Array of user IDs
   * @returns {Array} Array of FCM tokens
   */
  async getUserTokens(userIds) {
    try {
      const db = admin.firestore();
      const tokens = [];

      // Get tokens for each user
      for (const userId of userIds) {
        try {
          const userDoc = await db.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.fcmToken) {
              tokens.push(userData.fcmToken);
            }
          }
        } catch (userError) {
          console.log(`⚠️ Could not get token for user ${userId}:`, userError.message);
        }
      }

      return tokens;
    } catch (error) {
      console.error('❌ Error getting user tokens:', error);
      return [];
    }
  }

  /**
   * Send tournament ready notification
   * @param {Object} tournament - Tournament data
   * @param {Array} participants - Array of participant user IDs
   */
  async sendTournamentReadyNotification(tournament, participants) {
    const notification = {
      title: `🎮 ${tournament.name} Ready!`,
      body: `Your ${tournament.name} tournament is ready to start! ${tournament.players} players joined.`,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      click_action: 'TOURNAMENT_READY'
    };

    const data = {
      type: 'tournament_ready',
      tournamentId: tournament.id,
      tournamentType: tournament.type,
      tournamentName: tournament.name,
      players: tournament.players.toString(),
      entryFee: tournament.entryFee.toString()
    };

    return await this.sendToUsers(participants, notification, data);
  }

  /**
   * Send tournament started notification
   * @param {Object} tournament - Tournament data
   * @param {Array} participants - Array of participant user IDs
   */
  async sendTournamentStartedNotification(tournament, participants) {
    const notification = {
      title: `🚀 ${tournament.name} Started!`,
      body: `Your ${tournament.name} tournament has begun! Check your matches and start playing.`,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      click_action: 'TOURNAMENT_STARTED'
    };

    const data = {
      type: 'tournament_started',
      tournamentId: tournament.id,
      tournamentType: tournament.type,
      tournamentName: tournament.name,
      players: tournament.players.toString(),
      entryFee: tournament.entryFee.toString()
    };

    return await this.sendToUsers(participants, notification, data);
  }

  /**
   * Send match ready notification
   * @param {Object} tournament - Tournament data
   * @param {Array} userIds - Array of user IDs for the match
   * @param {Object} match - Match data
   */
  async sendMatchReadyNotification(tournament, userIds, match) {
    const notification = {
      title: `⚔️ Match Ready!`,
      body: `Your match in ${tournament.name} is ready to start!`,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      click_action: 'MATCH_READY'
    };

    const data = {
      type: 'match_ready',
      tournamentId: tournament.id,
      tournamentType: tournament.type,
      tournamentName: tournament.name,
      matchId: match.id,
      round: match.round.toString(),
      player1: match.player1?.username || 'Player 1',
      player2: match.player2?.username || 'Player 2'
    };

    return await this.sendToUsers(userIds, notification, data);
  }
}

module.exports = new NotificationService();
