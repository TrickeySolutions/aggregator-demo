# Cyber Insurance Quote Platform

A web application for generating cyber insurance quotes, built using Cloudflare Workers and Durable Objects. The application follows the GOV.UK Design System for a consistent and accessible user experience.

## Features

- Multi-step quote generation process
- Real-time form validation
- Persistent state management
- Progress tracking
- Responsive design
- Accessible interface

## Technology Stack

- Cloudflare Workers
- Durable Objects
- TypeScript
- WebSockets
- GOV.UK Design System

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Cloudflare Workers account
- Wrangler CLI

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

4. Start development server:
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
│   └── types/         # TypeScript type definitions
└── scripts/           # Build and setup scripts
```

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
