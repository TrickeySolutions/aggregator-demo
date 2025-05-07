# Cyber Insurance Quote Platform - Project Context

## Project Overview
A web application for generating cyber insurance quotes using Cloudflare Workers and Durable Objects. Uses GOV.UK Design System for UI/UX.

## Recent Changes
1. Added "Save as draft" functionality
2. Modified revenue field from number input to range selector:
   ```typescript
   revenue?: '0-50k' | '50k-100k' | '100k-500k' | '500k-1m' | '1m-10m' | '10m-100m' | '100m-1b' | 'over-1b';
   ```

## Current Issues
### TypeScript Linter Errors in activity.ts:
1. `activityState` initialization:
   ```typescript
   private activityState: ActivityState;  // Needs initializer or definite assignment
   ```

2. Section type mismatch:
   ```typescript
   this.activityState.currentSection = sections[currentIndex + 1];
   // Type 'string' not assignable to '"organisation" | "security" | "coverage" | "review"'
   ```

3. Spread operator type error:
   ```typescript
   this.activityState = { ...this.activityState, ...update };
   // Spread types may only be created from object types
   ```

## Project Structure
```
├── src/
│   ├── index.ts                    # Main Worker entry point
│   ├── durable_objects/
│   │   ├── activity.ts             # Quote activity state management
│   │   ├── customer.ts             # Customer management
│   │   └── partner.ts              # Insurance partner integration
│   └── types/
│       └── risk-profile.ts         # Risk assessment types
├── public/
│   ├── quote.html                  # Quote form UI
│   └── js/
│       └── quote-form.js           # Form handling and WebSocket logic
```

## Key Features
- Multi-step quote form with validation
- Real-time state management via WebSockets
- Draft saving capability
- Progress tracking
- Form state persistence in Durable Objects

## Next Steps
1. Fix TypeScript linter errors
2. Consider adding compliance section
3. Implement partner integration for quote aggregation
4. Add risk scoring system

## Technical Notes
- Using Cloudflare Workers
- Durable Objects for state management
- WebSocket connections for real-time updates
- GOV.UK Design System for UI components

## Live Demo
https://aggregator-demo.trickeysolutions.workers.dev/

## Development Commands
```bash
npm run dev     # Start development server
npm run deploy  # Deploy to Cloudflare Workers
``` 