# Cyber Insurance Quote Platform

A web application for generating cyber insurance quotes, built using Cloudflare Workers and Durable Objects. The application follows the GOV.UK Design System for a consistent and accessible user experience.

## Features

- Multi-step quote generation process
- Real-time form validation and state synchronization
- Persistent state management
- Progress tracking
- Asynchronous quote processing with multiple partners
- Real-time quote status updates
- Auto-save draft functionality
- Session management
- Activity timeout handling
- Responsive design
- Accessible interface

## Technology Stack

- Cloudflare Workers
- Durable Objects
- Cloudflare Queues
- Cloudflare Workflows
- TypeScript
- WebSockets
- GOV.UK Design System

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Cloudflare Workers account (https://dash.cloudflare.com/sign-up/workers)
- Wrangler CLI (https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up GOV.UK Frontend assets:
```bash
npm run setup-govuk
```

3. Configure Wrangler:
Make sure your `wrangler.jsonc` is properly configured with your account details.

4. Create required Cloudflare Queues:
Note: This step is only required if you are deploying to Cloudflare. If you are running locally, you can skip this step.
```bash
npx wrangler queues create activity-submission
npx wrangler queues create partner-quotes
```

5. Start development server:
```bash
npm run dev
```

## Development

The project structure:
```
├── public/              # Static assets
│   ├── js/             # Client-side JavaScript
│   └── assets/         # Images and other assets
├── src/                # Source code
│   ├── durable_objects/# Durable Object implementations
│   ├── workflows/      # Queue processing workflows
│   ├── types/         # TypeScript type definitions
│   └── index.ts       # Main worker entry point
└── scripts/           # Build and setup scripts
```

## User Flow

1. User clicks "Get a Quote" on the home page
2. System creates new customer and activity
3. User completes multi-step quote form
4. On submission:
   - Form data is saved
   - Partner quote requests are queued
   - User is redirected to results page
   - Partners process quote requests asynchronously
   - Results update in real-time as quotes arrive

## Technical Implementation

- Uses Durable Objects for persistent state management
- WebSocket connections for real-time updates
- Queue-based processing for partner integrations
- TypeScript for type safety
- Error handling and timeout management
- Activity state machine (draft → processing → getting_quotes → completed)

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

Note: Ensure you have created the required queues (see Setup step 4) before deploying.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
