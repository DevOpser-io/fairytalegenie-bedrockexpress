'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Drop the incorrect constraint that points to "Users" with capital U
      await queryInterface.sequelize.query(`
        ALTER TABLE conversations
        DROP CONSTRAINT IF EXISTS conversations_user_id_fkey1;
      `);
      
      console.log('Successfully dropped the incorrect FK constraint');
    } catch (error) {
      console.error('Error fixing duplicate FK constraint:', error);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // We don't want to recreate the incorrect constraint in the down migration
    console.log('No down migration needed for this fix');
  }
};
