#!/bin/bash

# Set required environment variables for testing
export DB_NAME_SECRET_NAME="test-db-name-secret"
export DB_USER_SECRET_NAME="test-db-user-secret"
export DB_PASSWORD_SECRET_NAME="test-db-password-secret"
export DB_HOST_SECRET_NAME="test-db-host-secret"
export DB_PORT_SECRET_NAME="test-db-port-secret"
export REGION="us-east-1"
export CUSTOMER_CROSS_ACCOUNT_ROLE_ARN="arn:aws:iam::767828725284:role/CrossAccountBedrockRole"

# Load existing .env file if it exists
if [ -f "../../.env" ]; then
  echo "Loading variables from .env file..."
  export $(grep -v '^#' ../../.env | xargs)
fi

# Run the migration script
echo "Running migration script..."
node run-prod-migrations.js
