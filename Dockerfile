# start by pulling the node image
FROM node:23.11.0-slim

# Install specific npm version and sequelize-cli globally
RUN npm install -g npm@11.3.0 sequelize-cli

# Create a group with GID 3000 to match K8s security context and add node user to it
RUN groupadd -g 3000 appgroup && usermod -a -G appgroup node

ENV PATH="/usr/local/bin:$PATH"
ENV DOCKER_BUILDKIT=1
ENV NODE_ENV=production
ARG REDIS_URL
ARG REGION
ARG CACHE_VERSION
ARG DB_NAME_SECRET_NAME
ARG DB_USER_SECRET_NAME
ARG DB_PASSWORD_SECRET_NAME
ARG DB_HOST_SECRET_NAME
ARG DB_PORT_SECRET_NAME
ARG MAIL_PASSWORD_SECRET_NAME
ARG MAIL_USERNAME
ARG MAIL_DEFAULT_SENDER
ARG ADDITIONAL_SECRETS
ARG ADMIN_USERS_SECRET_NAME
ARG CUSTOMER_CROSS_ACCOUNT_ROLE_ARN

ENV CACHE_VERSION=${CACHE_VERSION}
ENV REDIS_URL=${REDIS_URL}
ENV REGION=${REGION}
ENV DB_NAME_SECRET_NAME=${DB_NAME_SECRET_NAME}
ENV DB_USER_SECRET_NAME=${DB_USER_SECRET_NAME}
ENV DB_PASSWORD_SECRET_NAME=${DB_PASSWORD_SECRET_NAME}
ENV DB_HOST_SECRET_NAME=${DB_HOST_SECRET_NAME}
ENV DB_PORT_SECRET_NAME=${DB_PORT_SECRET_NAME}
ENV MAIL_PASSWORD_SECRET_NAME=${MAIL_PASSWORD_SECRET_NAME}
ENV ADMIN_USERS_SECRET_NAME=${ADMIN_USERS_SECRET_NAME}
ENV CUSTOMER_CROSS_ACCOUNT_ROLE_ARN=${CUSTOMER_CROSS_ACCOUNT_ROLE_ARN}

ENV MAIL_USERNAME=${MAIL_USERNAME}
ENV MAIL_DEFAULT_SENDER=${MAIL_DEFAULT_SENDER}

ENV ADDITIONAL_SECRETS=${ADDITIONAL_SECRETS}

# Set SSL requirement for database connection
ENV DB_REQUIRE_SSL=true

# Create necessary directories and set permissions
RUN mkdir -p /app /app/logs && \
    chown -R node:appgroup /app

# switch working directory
WORKDIR /app

# copy package.json files
COPY --chown=node:appgroup package*.json ./
COPY --chown=node:appgroup frontend/package*.json ./frontend/
COPY --chown=node:appgroup backend/package*.json ./backend/

# Install dependencies
RUN npm run install:all

# Install sequelize-cli and sequelize globally and in the backend directory
RUN npm install -g sequelize sequelize-cli

WORKDIR /app/backend
RUN npm install --save sequelize sequelize-cli
WORKDIR /app

# Install sequelize and pg packages globally for migration jobs
RUN npm install -g sequelize sequelize-cli pg pg-hstore @aws-sdk/client-secrets-manager @aws-sdk/credential-providers

# Create .sequelizerc file to point to the correct config location
RUN echo 'const path = require("path");\n\nmodule.exports = {\n  "config": path.resolve("backend/config/database.js"),\n  "models-path": path.resolve("backend/models"),\n  "seeders-path": path.resolve("backend/seeders"),\n  "migrations-path": path.resolve("backend/migrations")\n};' > /app/.sequelizerc

# copy every content from the local file to the image
COPY --chown=node:appgroup . /app

# Build frontend
RUN npm run frontend:build

ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# Switch to the non-root user
USER node

# configure the container to run in an executed manner
CMD ["npm", "run", "backend:start"]
