'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // 1) Remove the old, incorrect FK
      await queryInterface.removeConstraint('conversations', 'conversations_user_id_fkey');

      // 2) Add the correct FK
      await queryInterface.addConstraint('conversations', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'conversations_user_id_fkey', 
        references: {
          table: 'users',      // must exactly match your users table name!
          field: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
      
      console.log('Successfully fixed conversations_user_id_fkey constraint');
    } catch (error) {
      console.error('Error fixing FK constraint:', error);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // rollback: just drop the constraint
    try {
      await queryInterface.removeConstraint('conversations', 'conversations_user_id_fkey');
      console.log('Successfully removed conversations_user_id_fkey constraint');
    } catch (error) {
      console.error('Error removing FK constraint:', error);
    }
  }
};
