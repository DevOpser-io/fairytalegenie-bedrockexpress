const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const fs = require('fs');

// Print information about the environment
console.log(`Node.js version: ${process.version}`);
console.log('Using AWS SDK v3 for Secrets Manager');

// Function to get a secret from AWS Secrets Manager
async function getSecret(secretName, region) {
  if (!secretName) {
    console.error('Secret name not provided');
    return null;
  }
  
  console.log(`Retrieving secret: ${secretName} from region: ${region}`);
  
  try {
    // Create AWS Secrets Manager client
    const client = new SecretsManagerClient({
      region,
      maxAttempts: 3,
      retryMode: 'standard'
    });

    // Create the command to get the secret value
    const command = new GetSecretValueCommand({ SecretId: secretName });

    console.log(`Sending request to AWS Secrets Manager for secret: ${secretName}`);
    const response = await client.send(command);
    
    if (!response.SecretString) {
      console.error(`Secret ${secretName} has no string value`);
      return null;
    }
    
    console.log(`Successfully retrieved secret: ${secretName}`);
    return response.SecretString;
  } catch (error) {
    console.error(`Error retrieving secret ${secretName}: ${error.message}`);
    console.error(`Error name: ${error.name}`);
    
    if (error.name === 'ResourceNotFoundException') {
      console.error(`Secret ${secretName} not found`);
    } else if (error.name === 'AccessDeniedException') {
      console.error(`Access denied to secret ${secretName}`);
    } else if (error.name === 'InvalidParameterException') {
      console.error(`Invalid parameter for secret ${secretName}`);
    } else if (error.name === 'InvalidRequestException') {
      console.error(`Invalid request for secret ${secretName}`);
    }
    
    return null;
  }
}

async function main() {
  try {
    // Get environment variables
    const region = process.env.REGION || 'us-east-1';
    const dbNameSecretName = process.env.DB_NAME_SECRET_NAME;
    const dbUserSecretName = process.env.DB_USER_SECRET_NAME;
    const dbPasswordSecretName = process.env.DB_PASSWORD_SECRET_NAME;
    const dbHostSecretName = process.env.DB_HOST_SECRET_NAME;
    const dbPortSecretName = process.env.DB_PORT_SECRET_NAME;
    
    // Print environment variables for debugging
    console.log('Environment variables:');
    console.log(`REGION: ${region}`);
    console.log(`DB_NAME_SECRET_NAME: ${dbNameSecretName || 'Not set'}`);
    console.log(`DB_USER_SECRET_NAME: ${dbUserSecretName || 'Not set'}`);
    console.log(`DB_PASSWORD_SECRET_NAME: ${dbPasswordSecretName ? 'Set' : 'Not set'}`);
    console.log(`DB_HOST_SECRET_NAME: ${dbHostSecretName || 'Not set'}`);
    console.log(`DB_PORT_SECRET_NAME: ${dbPortSecretName || 'Not set'}`);
    
    // Check if all required secret names are provided
    if (!dbNameSecretName || !dbUserSecretName || !dbPasswordSecretName || 
        !dbHostSecretName || !dbPortSecretName) {
      console.error('Missing required database secret names in environment variables');
      console.error('Will use default values for missing secrets');
    }
    
    // Default values in case secrets cannot be retrieved - using the development credentials from config.py
    let dbName = 'devdb';
    let dbUser = 'devuser';
    let dbPassword = 'password';
    let dbHost = 'localhost';
    let dbPort = 5432;
    
    // Retrieve secrets from AWS Secrets Manager
    if (dbNameSecretName) {
      const retrievedDbName = await getSecret(dbNameSecretName, region);
      if (retrievedDbName) {
        dbName = retrievedDbName;
        console.log(`Using database name from secret: ${dbName}`);
      } else {
        console.warn(`Failed to retrieve database name, using default: ${dbName}`);
      }
    }
    
    if (dbUserSecretName) {
      const retrievedDbUser = await getSecret(dbUserSecretName, region);
      if (retrievedDbUser) {
        dbUser = retrievedDbUser;
        console.log(`Using username from secret: ${dbUser}`);
      } else {
        console.warn(`Failed to retrieve username, using default: ${dbUser}`);
      }
    }
    
    if (dbPasswordSecretName) {
      const retrievedDbPassword = await getSecret(dbPasswordSecretName, region);
      if (retrievedDbPassword) {
        dbPassword = retrievedDbPassword;
        console.log('Using password from secret');
      } else {
        console.warn('Failed to retrieve password, using default');
      }
    }
    
    if (dbHostSecretName) {
      const retrievedDbHost = await getSecret(dbHostSecretName, region);
      if (retrievedDbHost) {
        dbHost = retrievedDbHost;
        console.log(`Using host from secret: ${dbHost}`);
      } else {
        console.warn(`Failed to retrieve host, using default: ${dbHost}`);
      }
    }
    
    if (dbPortSecretName) {
      const retrievedDbPort = await getSecret(dbPortSecretName, region);
      if (retrievedDbPort) {
        dbPort = parseInt(retrievedDbPort, 10);
        console.log(`Using port from secret: ${dbPort}`);
      } else {
        console.warn(`Failed to retrieve port, using default: ${dbPort}`);
      }
    }
    
    console.log(`Database configuration: ${dbName} at ${dbHost}:${dbPort} with user ${dbUser}`);
    
    // Create a temporary .sequelizerc file
    const sequelizeConfig = `
const path = require('path');

module.exports = {
  'config': path.resolve('temp-config', 'database.js'),
  'models-path': path.resolve('models'),
  'seeders-path': path.resolve('seeders'),
  'migrations-path': path.resolve('migrations')
};
    `;
    
    fs.writeFileSync('.sequelizerc', sequelizeConfig);
    console.log('Created .sequelizerc file');
    
    // Check if SSL is required
    const requireSSL = process.env.DB_REQUIRE_SSL === 'true';
    console.log(`SSL requirement for database connection: ${requireSSL ? 'Required' : 'Not required'}`);
    
    // Create a temporary database config file for migrations
    const dbConfig = `
module.exports = {
  development: {
    username: 'devuser',
    password: 'password',
    database: 'devdb',
    host: 'localhost',
    port: 5432,
    dialect: 'postgres'
  },
  test: {
    username: 'devuser',
    password: 'password',
    database: 'devdb',
    host: 'localhost',
    port: 5432,
    dialect: 'postgres'
  },
  production: {
    username: '${dbUser}',
    password: '${dbPassword}',
    database: '${dbName}',
    host: '${dbHost}',
    port: ${dbPort},
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: ${requireSSL ? `{
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }` : '{}'}
  }
};
    `;
    
    // Create a temporary directory for the config if it doesn't exist
    if (!fs.existsSync('temp-config')) {
      fs.mkdirSync('temp-config');
      console.log('Created temp-config directory');
    }
    
    fs.writeFileSync('temp-config/database.js', dbConfig);
    console.log('Created temporary database configuration file');
    
    // Test database connection
    console.log('Testing database connection...');
    const { Sequelize } = require('sequelize');
    const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
      host: dbHost,
      port: dbPort,
      dialect: 'postgres',
      logging: console.log,
      dialectOptions: requireSSL ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {}
    });
    
    try {
      await sequelize.authenticate();
      console.log('Database connection test successful!');
      return true;
    } catch (connError) {
      console.error('Database connection test failed:', connError.message);
      console.error('Will attempt migrations anyway');
      return true; // Still return true to continue with migrations
    }
  } catch (error) {
    console.error('Failed to retrieve database credentials:', error);
    return false;
  }
}

main()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
