# Bedrock Express

An Express.js version of a Bedrock AI Chat application with Amazon Bedrock integration. This application features a clear separation between frontend and backend components for easier AI-driven customization.

## Project Structure

The project is organized with a clear separation of concerns:

```
bedrock-express/
├── frontend/                 # Frontend code
│   ├── node_modules/         # Frontend dependencies
│   ├── public/               # Static assets served by Express
│   │   ├── static/           # CSS, JS, images, etc.
│   │   └── index.html        # Main HTML entry point
│   ├── src/                  # Frontend source code
│   │   ├── chat.js           # Chat functionality
│   │   ├── styles.css        # Main stylesheet
│   │   ├── mfa.js            # Multi-factor authentication
│   │   └── account.js        # Account management
│   ├── package.json          # Frontend dependencies
│   └── webpack.config.js     # Frontend webpack configuration
│
├── backend/                  # Backend code
│   ├── node_modules/         # Backend dependencies
│   ├── config/               # Configuration settings
│   ├── controllers/          # Request handlers
│   ├── routes/               # API routes
│   ├── services/             # Business logic and external services
│   ├── utils/                # Utility functions
│   ├── package.json          # Backend dependencies
│   └── server.js             # Main entry point
│
└── package.json              # Root coordination scripts
```

## Features

- Clear separation between frontend and backend
- Amazon Bedrock integration for AI chat
- Streaming message responses
- Chat history management
- Temporary/persistent conversation modes

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- AWS credentials configured for Bedrock access

### Installation

```bash
# Install all dependencies (frontend and backend)
npm run install:all
```

### Development

```bash
# Build frontend assets and start backend in development mode
npm run dev

# Just build frontend assets
npm run frontend:build

# Watch frontend files for changes
npm run frontend:watch

# Start backend in development mode
npm run backend:dev
```

### Production

```bash
# Build frontend and start backend
npm start
```

## Configuration

The application's configuration is centralized in the `backend/config/index.js` file. You can customize settings through environment variables or by modifying the config file directly.

Key settings include:

- Server port (default: 8000)
- AWS Bedrock model ID and parameters
- Chat settings (system prompt, history size)

## Architecture

This application follows a modular architecture:

1. **Frontend**: Browser-based UI built with vanilla JavaScript and CSS
2. **Backend**: Express.js server with Amazon Bedrock integration
3. **API**: RESTful endpoints for chat and conversation management

The frontend and backend communicate via HTTP requests, with server-sent events (SSE) used for streaming responses.