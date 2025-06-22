'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Get all users from the Users table
      const [users] = await queryInterface.sequelize.query(`
        SELECT * FROM "Users";
      `);
      
      console.log(`Found ${users.length} users in the Users table`);
      
      // For each user, insert or update in the users table
      for (const user of users) {
        // Check if user already exists in lowercase table
        const [existingUser] = await queryInterface.sequelize.query(`
          SELECT id FROM users WHERE id = ${user.id};
        `);
        
        if (existingUser && existingUser.length > 0) {
          console.log(`User ${user.id} already exists in users table, updating...`);
          // Update existing user
          await queryInterface.sequelize.query(`
            UPDATE users 
            SET 
              email = '${user.email}',
              "passwordHash" = '${user.passwordHash}',
              name = ${user.name ? `'${user.name}'` : 'NULL'},
              "isAdmin" = ${user.isAdmin},
              "isActive" = ${user.isActive},
              "createdAt" = '${user.createdAt}',
              "lastLogin" = ${user.lastLogin ? `'${user.lastLogin}'` : 'NULL'},
              "mfaSecret" = ${user.mfaSecret ? `'${user.mfaSecret}'` : 'NULL'},
              "mfaEnabled" = ${user.mfaEnabled},
              "hasAuthenticator" = ${user.hasAuthenticator},
              "isMfaSetupComplete" = ${user.isMfaSetupComplete},
              "emailVerified" = ${user.emailVerified},
              "emailVerificationToken" = ${user.emailVerificationToken ? `'${user.emailVerificationToken}'` : 'NULL'},
              "emailVerificationSentAt" = ${user.emailVerificationSentAt ? `'${user.emailVerificationSentAt}'` : 'NULL'},
              "backupCodesHash" = '${JSON.stringify(user.backupCodesHash || [])}',
              "preferredMfaMethod" = ${user.preferredMfaMethod ? `'${user.preferredMfaMethod}'` : 'NULL'},
              "passwordResetToken" = ${user.passwordResetToken ? `'${user.passwordResetToken}'` : 'NULL'},
              "passwordResetSentAt" = ${user.passwordResetSentAt ? `'${user.passwordResetSentAt}'` : 'NULL'},
              "subscriptionId" = ${user.subscriptionId ? `'${user.subscriptionId}'` : 'NULL'},
              "updatedAt" = '${user.updatedAt}'
            WHERE id = ${user.id};
          `);
        } else {
          console.log(`Inserting user ${user.id} into users table...`);
          // Insert new user
          await queryInterface.sequelize.query(`
            INSERT INTO users (
              id, email, "passwordHash", name, "isAdmin", "isActive", 
              "createdAt", "lastLogin", "mfaSecret", "mfaEnabled", 
              "hasAuthenticator", "isMfaSetupComplete", "emailVerified", 
              "emailVerificationToken", "emailVerificationSentAt", 
              "backupCodesHash", "preferredMfaMethod", "passwordResetToken", 
              "passwordResetSentAt", "subscriptionId", "updatedAt"
            ) VALUES (
              ${user.id},
              '${user.email}',
              '${user.passwordHash}',
              ${user.name ? `'${user.name}'` : 'NULL'},
              ${user.isAdmin},
              ${user.isActive},
              '${user.createdAt}',
              ${user.lastLogin ? `'${user.lastLogin}'` : 'NULL'},
              ${user.mfaSecret ? `'${user.mfaSecret}'` : 'NULL'},
              ${user.mfaEnabled},
              ${user.hasAuthenticator},
              ${user.isMfaSetupComplete},
              ${user.emailVerified},
              ${user.emailVerificationToken ? `'${user.emailVerificationToken}'` : 'NULL'},
              ${user.emailVerificationSentAt ? `'${user.emailVerificationSentAt}'` : 'NULL'},
              '${JSON.stringify(user.backupCodesHash || [])}',
              ${user.preferredMfaMethod ? `'${user.preferredMfaMethod}'` : 'NULL'},
              ${user.passwordResetToken ? `'${user.passwordResetToken}'` : 'NULL'},
              ${user.passwordResetSentAt ? `'${user.passwordResetSentAt}'` : 'NULL'},
              ${user.subscriptionId ? `'${user.subscriptionId}'` : 'NULL'},
              '${user.updatedAt}'
            );
          `);
        }
      }
      
      console.log('Successfully copied users data from Users to users table');
    } catch (error) {
      console.error('Error copying users data:', error);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // No down migration needed
    console.log('No down migration needed for this fix');
  }
};
