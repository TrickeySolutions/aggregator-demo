# Cyber Insurance Quote Platform

A web application for generating cyber insurance quotes, built using Cloudflare Workers and following the GOV.UK Design System patterns.

## Architecture Overview

```
                                    ┌─────────────────┐
                                    │                 │
                           ┌───────►│  Quote Queue    │
                           │        │                 │
┌──────────┐     ┌────────┴──┐     └────────┬───────┘
│          │     │           │              │
│  Client  │────►│  Activity │◄─────────────┤
│          │     │    DO     │              │
└──────────┘     │           │     ┌────────┴───────┐
                 └────────┬──┘     │                │
                         │         │ Partner Queue  │
                         └────────►│                │
                                   └────────────────┘
```

### Quote Processing Flow
1. Client submits form
2. Activity DO updates status to "processing"
3. Message sent to Quote Queue
4. Workflow processes quote request
5. Multiple messages sent to Partner Queue (fan-out)
6. Partners process quotes independently
7. Results update Activity DO (fan-in)
8. Client sees real-time updates

## Current State

The application now has:

1. **User Interface**
   - Clean, responsive design following GOV.UK Design System
   - Consistent header with Trickey.Solutions branding
   - Progress bar navigation
   - Multi-step form with real-time validation
   - Review page with section summaries

2. **Form Sections**
   - Organisation Details
   - Exposure Assessment
   - Security Controls
   - Review & Submit

3. **Key Features**
   - Real-time form updates via WebSocket
   - Draft saving functionality
   - Client-side validation
   - Responsive design for mobile and desktop
   - Consistent branding across pages

4. **Technical Implementation**
   - Cloudflare Workers for serverless backend
   - Durable Objects for state management
   - WebSocket connections for real-time updates
   - Client-side JavaScript for form handling
   - GOV.UK Frontend components

5. **Styling**
   - Custom Calculator font for branding
   - Gradient text effects
   - Responsive layout adjustments
   - Mobile-friendly navigation
   - Consistent header design across pages

## Project Structure

```
public/
  ├── js/
  │   ├── quote-form.js    # Form handling and WebSocket logic
  │   └── app.js           # General application JavaScript
  ├── index.html          # Landing page
  └── quote.html          # Quote form page

src/
  ├── index.ts            # Main worker entry point
  └── durable_objects/
      └── activity.ts     # Quote session state management
```

## Next Steps

Potential areas for future development:
1. Enhanced form validation
2. Additional user feedback mechanisms
3. Performance optimizations
4. Error handling improvements
5. Accessibility enhancements

## Dependencies

- GOV.UK Frontend
- Cloudflare Workers
- Durable Objects
- WebSocket API 