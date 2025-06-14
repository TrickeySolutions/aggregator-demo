# Cyber Insurance Quote Platform

A demonstration web application for a cyber insurance comparison service.
 
It can be used to demonstrate a wide variety Cloudflare developer platform features 
At the core of this application is a fan-in fan-out architecture that scatters the risk profiles to many potential insruance prviders and then gatehrs the results for aggregation.
The applciation leverages AI inference to genreate brand identities for the dummy insurance partners
  

🚀 **<a href="https://compare.trickey.solutions" target="_blank">View Live Demo</a>** - See the application in action with a fully deployed example.

## User Flow

1. User clicks "Get a Quote" on the home page
2. System creates new customer and activity
3. User completes multi-step quote form
4. On submission:
   - Form data is saved - user is redirected to a results page
   - Users activity profile is asynch sent to AI Generated Partners
   - Partners process activities requests asynchronously and offer quotes
   - Quote Results are aggregated in real-time as as they arrive
5. User can compare offers to choose which quote to accept

## Features

- Multi-step quote generation process
- Real-time form validation and state synchronization
- Persistent state management with Durable Objects
- Progress tracking
- Asynchronous quote processing with AI-generated partners
- Real-time quote status updates
- Auto-save draft functionality
- Session management
- Activity timeout handling
- Responsive design
- Accessible interface
- Optional AI Gateway integration for analytics and monitoring
- Optional Turnstyle bot protection

## Technology Stack

- Cloudflare Workers
- Durable Objects
- Cloudflare R2 Storage
- Workers AI (LLM Inferance)
- Optional: Cloudflare AI Gateway
- Cloudflare Turnstile
- TypeScript
- GOV.UK Design System

## Prerequisites

- Cloudflare Workers account (https://dash.cloudflare.com/sign-up/workers)
- Cloudflare Turnstyle site key + secret (https://developers.cloudflare.com/turnstile/get-started/#get-a-sitekey-and-secret-key)
<details>
<summary>Optional: Local Development Prereqisites}</summary>

If you want to develop locally or manage resources via command line, you'll also need:

- Node.js (v16 or higher)
- npm or yarn
- Wrangler CLI (https://developers.cloudflare.com/workers/wrangler/install-and-update/)

</details>

## Quick Start

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FTrickeySolutions%2Faggregator-demo)

The Deploy to Cloudflare button will automatically:
1. Fork this repository to your GitHub account
2. Connect it to Cloudflare Builds
3. Start the initial deployment
4. Provision primatives as resources (Queues, Object Storage, AI Inferance, Durable Objects etc..)

> **Note**: When using the Deploy button, all required Cloudflare resources are automatically provisioned for you. You only need to configure environment variables after deployment.

### Configure Environment Variables

Create a `.dev.vars` file in your project root with the following required variables:
```
TURNSTILE_SITE_KEY=your_site_key_here
TURNSTILE_SECRET_KEY=your_secret_key_here
```

Optional environment variables for enhanced functionality:
```
AI_GATEWAY_ID=your_gateway_id_here  # Enable AI Gateway features like analytics and logging
```

For production, you can set the variables either through the Dashboard UI or using wrangler commands:

```bash
# Required secrets
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put TURNSTILE_SECRET_KEY

# Optional: Enable AI Gateway features
wrangler secret put AI_GATEWAY_ID
```

<Details> 
<summary>Alternatively, via the Cloudflare Dashboard:</summary>

1. Go to Workers & Pages
2. Select your application
3. Go to Settings > Environment Variables
4. Add the variables as above

</details>
## Manual Setup

If you prefer to set up the project manually instead of using the Deploy button, you'll need to create the following resources:

#### Create R2 Bucket
```bash
npx wrangler r2 bucket create partner-logos
npx wrangler r2 bucket create partner-logos-dev
```

#### Set up Cloudflare Turnstile (Required)
1. Go to Cloudflare Dashboard > Security > Turnstile
2. Create a new site widget
3. Note down the Site Key and Secret Key

#### Set up Cloudflare AI Gateway (Optional)
For enhanced AI features like analytics, logging, and caching:
1. Go to Cloudflare Dashboard > AI
2. Create a new AI Gateway
3. Note down the Gateway ID and set it as the `AI_GATEWAY_ID` environment variable

The application will work without AI Gateway, but setting it up provides:
- Real-time analytics for AI model usage
- Request/response logging
- Caching capabilities
- Rate limiting controls
- Cost monitoring

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Project Structure

```
├── public/              # Static assets
│   ├── js/              # Client-side JavaScript
│   └── assets/          # Images and other assets
├── src/                 # Source code
│   ├── durable_objects/ # Durable Object implementations
│   ├── workflows/       # async workflows
│   ├── types/          # TypeScript type definitions
│   └── index.ts        # Main worker entry point
└── scripts/            # Build and setup scripts
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

If you encounter any issues during setup:

1. Verify all Cloudflare services are properly created and configured
2. Check that all environment variables are set correctly (use dev.vars file locally and secrets when deployed)
3. Ensure your Cloudflare account has access to all required services (Workers, R2, AI Gateway, etc.)
4. Check the Workers logs in the Cloudflare Dashboard for any error messages
