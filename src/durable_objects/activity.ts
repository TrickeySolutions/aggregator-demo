/**
 * ActivityDO - Durable Object for managing quote activity state
 * 
 * Handles:
 * - Form state persistence
 * - WebSocket connections
 * - Real-time updates
 * - Session management
 */

import { RiskProfile } from '../types/risk-profile';

// Define valid sections as const array
const sections = ['organisation', 'exposure', 'security', 'review'] as const;
type SectionType = typeof sections[number];

interface ActivityState {
  currentSection: SectionType;
  formData?: {
    [key: string]: any;
  };
  status: 'draft' | 'processing' | 'getting_quotes' | 'completed' | 'error' | 'failed';
  updatedAt: number;
  quotes: {
    [partnerId: string]: {
      partnerName: string;
      status: 'processing' | 'complete' | 'error';
      price?: number;
      updatedAt: string;
    };
  };
  customerId: string;
}

export class ActivityDO {
  private state: DurableObjectState;
  private sessions: Set<WebSocket>;
  private env: any; // Will contain bindings
  // Initialize with default state to fix "no initializer" error
  private activityState: ActivityState = {
    currentSection: 'organisation',
    formData: {},
    status: 'draft',
    quotes: {},
    customerId: '',
    updatedAt: Date.now()
  };

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.sessions = new Set();
    this.env = env;
  }

  async initialize() {
    // Load stored state, cast as ActivityState to ensure type safety
    const stored = await this.state.storage.get('state') as ActivityState | null;
    if (stored) {
      this.activityState = stored;
    }
  }

  // Fix section type error in navigation
  private async updateSection(section: string) {
    const currentIndex = sections.indexOf(this.activityState.currentSection);
    if (currentIndex < sections.length - 1) {
      // Cast to SectionType since we know it's valid from the sections array
      const nextSection = sections[currentIndex + 1] as SectionType;
      this.activityState.currentSection = nextSection;
    }
  }

  // Fix spread operator error by typing the update parameter
  private async updateState(update: Partial<ActivityState>) {
    // Create new state object
    this.activityState = {
        ...this.activityState,
        ...update,
        updatedAt: Date.now()
    };
    await this.state.storage.put('state', this.activityState);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    console.log('[ActivityDO] Handling request:', url.pathname);
    console.log('[ActivityDO] DO ID:', this.state.id.toString());
    console.log('[ActivityDO] URL activity ID:', url.pathname.split('/').filter(Boolean)[4]);
    
    // Load state first
    const stored = await this.state.storage.get<ActivityState>('state');
    
    // Initialize or load state
    if (stored) {
        console.log('[ActivityDO] Loaded stored state with customer ID:', stored.customerId);
        this.activityState = stored;
    } else if (request.method === 'POST' && request.url.includes('/init')) {
        // Extract customer ID from URL path correctly
        const parts = url.pathname.split('/');
        const customerIndex = parts.indexOf('customer');
        if (customerIndex === -1 || !parts[customerIndex + 1]) {
            console.error('[ActivityDO] Failed to extract customer ID from URL:', url.pathname);
            return new Response('Invalid customer ID', { status: 400 });
        }
        const customerId = parts[customerIndex + 1];
        console.log('[ActivityDO] Initializing new state with customer ID:', customerId);
        
        // Initialize state
        this.activityState = {
            currentSection: 'organisation',
            formData: {},
            status: 'draft',
            quotes: {},
            updatedAt: Date.now(),
            customerId
        };
        await this.state.storage.put('state', this.activityState);
        console.log('[ActivityDO] Saved initial state with customer ID:', customerId);
        return new Response('OK');
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        console.log('[ActivityDO] Handling WebSocket upgrade with state:', JSON.stringify(this.activityState, null, 2));
        const pair = new WebSocketPair();
        const server = pair[1];
        server.accept();
        this.sessions.add(server);

        // Send initial state
        server.send(JSON.stringify({
            type: 'state_update',
            state: this.activityState
        }));

        // Handle messages
        server.addEventListener('message', async (msg) => {
            try {
                const data = JSON.parse(msg.data as string);
                if (data.type === 'form_update') {
                    // Update state
                    this.activityState.formData = {
                        ...this.activityState.formData,
                        ...data.formData
                    };
                    this.activityState.updatedAt = Date.now();
                    
                    // Update current section if all required fields are filled
                    if (this.validateSection(data.formData)) {
                        await this.updateSection(data.formData.currentSection);
                    }

                    // Save state
                    await this.updateState(this.activityState);

                    // Broadcast to all clients
                    const update = JSON.stringify({
                        type: 'state_update',
                        state: this.activityState
                    });

                    this.sessions.forEach(ws => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(update);
                        }
                    });
                } else if (data.type === 'submit') {
                    try {
                        await this.handleSubmit(data);
                    } catch (error) {
                        console.error('Submit error:', error);
                        server.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to submit quote request'
                        }));
                    }
                } else if (data.type === 'save_draft') {
                    // Handle save draft action
                    this.activityState.status = 'draft';
                    await this.updateState(this.activityState);
                    
                    // Notify all clients
                    const update = JSON.stringify({
                        type: 'state_update',
                        state: this.activityState
                    });
                    
                    this.sessions.forEach(ws => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(update);
                        }
                    });
                }
            } catch (err) {
                console.error('Error handling message:', err);
            }
        });

        server.addEventListener('close', () => {
            this.sessions.delete(server);
        });

        server.addEventListener('error', () => {
            this.sessions.delete(server);
        });

        return new Response(null, {
            status: 101,
            webSocket: pair[0]
        });
    }

    // Handle HTTP requests
    if (request.method === 'GET') {
        return new Response(JSON.stringify(this.activityState), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (request.method === 'POST') {
        if (request.headers.get('Content-Type') === 'application/json') {
            const body = await request.json();
            
            // Handle quote updates
            if (url.pathname === '/api/update-quote' && body.partnerId) {
                console.log('[ActivityDO] Updating quote with body:', body);
                await this.updateQuote(body.partnerId, body);
                return new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Handle other state updates
            await this.updateState(body);
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (request.url.includes('/init')) {
            return new Response('OK');
        }
    }

    return new Response('Method not allowed', { status: 405 });
  }

  private validateSection(formData: any): boolean {
    const section = Object.keys(formData)[0];
    const data = formData[section];

    switch (section) {
      case 'organisation':
        return !!(data.name && data.industry && data.revenue && data.employees);
      case 'security':
        return !!(data.backupFrequency && data.firewallEnabled !== undefined && 
                 data.antivirusEnabled !== undefined && data.trainingFrequency);
      case 'coverage':
        return !!(data.coverageLimit && data.excess);
      default:
        return false;
    }
  }

  async alarm() {
    // Handle timeout - close the activity if still open after 24 hours
    const stored = await this.state.storage.get<ActivityState>('state');
    // Check for processing or getting_quotes status
    if (stored && (stored.status === 'processing' || stored.status === 'getting_quotes')) {
        const timeout = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - stored.updatedAt > timeout) {
            stored.status = 'failed';
            await this.state.storage.put('state', stored);
            
            // Notify all connected clients
            this.sessions.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'state_update',
                        state: stored
                    }));
                }
            });
        }
    }
  }

  async handleSubmit(data: { activityId: string }) {
    console.log('[ActivityDO] Starting submit with state:', JSON.stringify(this.activityState, null, 2));
    
    if (data.activityId !== this.state.id.toString()) {
        console.error('[ActivityDO] Activity ID mismatch:', data.activityId, 'vs', this.state.id.toString());
        throw new Error('Activity ID mismatch');
    }

    if (!this.activityState.customerId) {
        console.error('[ActivityDO] No customer ID in state');
        throw new Error('No customer ID found');
    }

    // Update status
    this.activityState.status = 'processing';
    
    // Initialize empty quotes object
    this.activityState.quotes = {};

    // Save state before sending to queue
    await this.updateState(this.activityState);
    console.log('[ActivityDO] State updated, sending to queue');

    const activityId = this.state.id.toString();
    console.log('[ActivityDO] Activity ID:', activityId);

    const queueMessage = {
        activityId,
        formData: this.activityState.formData
    };

    await this.env.ACTIVITY_SUBMISSION_QUEUE.send(queueMessage);
    console.log('[ActivityDO] Message sent to queue');

    // Send redirect URL with same activity ID
    const redirectUrl = `/customer/${this.activityState.customerId}/activity/${activityId}/results`;
    console.log('[ActivityDO] Redirect URL:', redirectUrl);

    const update = JSON.stringify({
        type: 'submit_success',
        activityId,
        redirectUrl
    });

    this.sessions.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(update);
        }
    });

    return { success: true };
  }

  async updateQuote(partnerId: string, update: any) {
    console.log('[ActivityDO] Updating quote for partner:', partnerId, 'with update:', update);
    
    // Initialize quotes object if it doesn't exist
    if (!this.activityState.quotes) {
        this.activityState.quotes = {};
    }

    // Extract the actual update data from the request
    const quoteUpdate = update.update || update;
    
    // Initialize or update the quote for this partner
    this.activityState.quotes[partnerId] = {
        ...this.activityState.quotes[partnerId],  // Preserve existing data
        partnerName: quoteUpdate.partnerName || this.activityState.quotes[partnerId]?.partnerName || `Partner ${partnerId}`,
        status: quoteUpdate.status || 'processing',
        updatedAt: quoteUpdate.updatedAt || new Date().toISOString(),
        ...(quoteUpdate.price !== undefined && { price: quoteUpdate.price })
    };

    // Check if all quotes are complete
    const allComplete = Object.values(this.activityState.quotes)
        .every(q => q.status === 'complete' || q.status === 'error');

    if (allComplete) {
        this.activityState.status = 'completed';
    }

    // Remove any temporary update data from the state
    if ('update' in this.activityState) {
        delete this.activityState.update;
    }
    if ('partnerId' in this.activityState) {
        delete this.activityState.partnerId;
    }

    // Save state changes
    await this.updateState(this.activityState);

    // Notify clients
    const message = JSON.stringify({
        type: 'state_update',
        state: this.activityState
    });

    this.sessions.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });

    return { success: true };
  }
} 