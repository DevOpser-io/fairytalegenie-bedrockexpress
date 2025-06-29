/**
 * Debug script to validate AWS Secrets Manager configuration
 * This script will attempt to retrieve database credentials from AWS Secrets Manager
 * and print them out (with password masked) to verify the configuration is working.
 */

// Set NODE_ENV to production to use AWS Secrets Manager
process.env.NODE_ENV = 'production';

// Import configuration after setting NODE_ENV
const config = require('./config/index');

async function debugSecretsManager() {
  console.log('=== AWS Secrets Manager Debug ===');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('AWS Region:', config.aws.region);
  
  // Print secret names from configuration
  console.log('\n=== Secret Names ===');
  console.log('DB Name Secret:', config.database.secretNames.dbName);
  console.log('DB User Secret:', config.database.secretNames.dbUser);
  console.log('DB Password Secret:', config.database.secretNames.dbPassword);
  console.log('DB Host Secret:', config.database.secretNames.dbHost);
  console.log('DB Port Secret:', config.database.secretNames.dbPort);
  
  try {
    // With our updated config/index.js, the secrets should already be loaded
    // Let's verify the database configuration has the correct values
    console.log('\n=== Database Configuration ===');
    console.log('DB Name:', config.database.name);
    console.log('DB User:', config.database.username);
    console.log('DB Password:', config.database.password ? '***MASKED***' : 'null');
    console.log('DB Host:', config.database.host);
    console.log('DB Port:', config.database.port);
    
    // Now let's verify if these values match what we would get directly from Secrets Manager
    console.log('\n=== Verifying with Secrets Manager directly ===');
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const secretsManager = new SecretsManagerClient({
      region: config.aws.region
    });
    
    async function getSecret(secretName) {
      if (!secretName) {
        console.log(`Secret name not provided for ${secretName}`);
        return null;
      }
      
      try {
        console.log(`Retrieving secret: ${secretName}`);
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await secretsManager.send(command);
        if (response.SecretString) {
          console.log(`Successfully retrieved secret: ${secretName}`);
          return response.SecretString;
        }
        return null;
      } catch (err) {
        console.error(`Error retrieving secret ${secretName}:`, err.message);
        return null;
      }
    }
    
    // Retrieve secrets directly
    const dbNameSecret = await getSecret(config.database.secretNames.dbName);
    const dbUserSecret = await getSecret(config.database.secretNames.dbUser);
    const dbPasswordSecret = await getSecret(config.database.secretNames.dbPassword);
    const dbHostSecret = await getSecret(config.database.secretNames.dbHost);
    const dbPortSecret = await getSecret(config.database.secretNames.dbPort);
    
    // Compare values
    console.log('\n=== Comparison ===');
    console.log('DB Name matches:', dbNameSecret === config.database.name);
    console.log('DB User matches:', dbUserSecret === config.database.username);
    console.log('DB Password matches:', dbPasswordSecret === config.database.password);
    console.log('DB Host matches:', dbHostSecret === config.database.host);
    console.log('DB Port matches:', dbPortSecret === String(config.database.port));
    
    // Check for .sequelizerc file
    console.log('\n=== Checking for .sequelizerc file ===');
    const fs = require('fs');
    const path = require('path');
    const sequelizeRcPath = path.resolve('.sequelizerc');
    
    if (fs.existsSync(sequelizeRcPath)) {
      console.log('.sequelizerc file exists:', sequelizeRcPath);
      try {
        const sequelizeRcContent = fs.readFileSync(sequelizeRcPath, 'utf8');
        console.log('.sequelizerc content:', sequelizeRcContent);
      } catch (err) {
        console.error('Error reading .sequelizerc file:', err.message);
      }
    } else {
      console.log('.sequelizerc file does not exist. Creating it...');
      const sequelizeRcContent = `const path = require('path');

module.exports = {
  'config': path.resolve('config', 'database.js'),
  'models-path': path.resolve('models'),
  'seeders-path': path.resolve('seeders'),
  'migrations-path': path.resolve('migrations')
};`;
      
      try {
        fs.writeFileSync(sequelizeRcPath, sequelizeRcContent, 'utf8');
        console.log('.sequelizerc file created successfully');
      } catch (err) {
        console.error('Error creating .sequelizerc file:', err.message);
      }
    }
    
    // Test database connection
    console.log('\n=== Testing database connection ===');
    const { Sequelize } = require('sequelize');
    
    // Check if SSL is required
    const requireSSL = process.env.DB_REQUIRE_SSL === 'true';
    console.log(`SSL requirement for database connection: ${requireSSL ? 'Required' : 'Not required'}`);
    
    // Get the database configuration directly from our config
    const dbConfig = {
      host: config.database.host,
      port: config.database.port,
      username: config.database.username,
      password: config.database.password,
      database: config.database.name,
      dialect: 'postgres',
      logging: console.log,
      dialectOptions: requireSSL ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {}
    };
    
    console.log('Database configuration (password masked):', {
      ...dbConfig,
      password: '***MASKED***'
    });
    
    const sequelize = new Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect,
        logging: dbConfig.logging,
        dialectOptions: dbConfig.dialectOptions
      }
    );
    
    try {
      await sequelize.authenticate();
      console.log('Database connection successful!');
    } catch (error) {
      console.error('Database connection failed:', error.message);
    }
    
    // Also test the database connection using the Sequelize CLI configuration
    console.log('\n=== Testing Sequelize CLI configuration ===');
    const dbCliConfig = require('./config/database');
    console.log('Sequelize CLI config for production:', {
      ...dbCliConfig.production,
      password: '***MASKED***'
    });
    
    // Verify that the CLI config matches our application config
    console.log('\n=== Comparing configs ===');
    console.log('Host matches:', dbCliConfig.production.host === config.database.host);
    console.log('Port matches:', dbCliConfig.production.port === config.database.port);
    console.log('Username matches:', dbCliConfig.production.username === config.database.username);
    console.log('Password matches:', dbCliConfig.production.password === config.database.password);
    console.log('Database matches:', dbCliConfig.production.database === config.database.name);
    
  } catch (error) {
    console.error('Error during secrets validation:', error);
  }
}

// Run the debug function
debugSecretsManager().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
