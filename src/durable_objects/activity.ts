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
import { handleActivitySubmission } from '../workflows/activity-submission';
import { verifyTurnstileToken } from '../utils/turnstile';

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
  expectedPartnerCount?: number;
}

interface QuoteUpdate {
    partnerId: string;
    partnerName: string;
    status: 'processing' | 'complete' | 'error';
    price?: number;
    logoUrl?: string;
    characteristics?: any;
    updatedAt: string;
}

interface SubmitData {
    type: string;
    activityId: string;
    turnstileToken?: string;
}

export class ActivityDO {
  private state: DurableObjectState;
  private sessions: Set<WebSocket>;
  private env: Env;
  // Initialize with default state to fix "no initializer" error
  private activityState: ActivityState = {
    currentSection: 'organisation',
    formData: {},
    status: 'draft',
    quotes: {},
    customerId: '',
    updatedAt: Date.now()
  };

  constructor(state: DurableObjectState, env: Env) {
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

  async fetch(request: Request, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    console.log('[ActivityDO] Handling:', url.pathname);
    
    // Load state first
    const stored = await this.state.storage.get<ActivityState>('state');
    
    if (stored) {
        console.log('[ActivityDO] Loaded stored state');
        this.activityState = stored;
    } else if (request.method === 'POST' && request.url.includes('/init')) {
        const parts = url.pathname.split('/');
        const customerIndex = parts.indexOf('customer');
        if (customerIndex === -1 || !parts[customerIndex + 1]) {
            console.error('[ActivityDO] Failed to extract customer ID');
            return new Response('Invalid customer ID', { status: 400 });
        }
        const customerId = parts[customerIndex + 1];
        console.log('[ActivityDO] Initializing new state');
        
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
        return new Response('OK');
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        console.log('[ActivityDO] WebSocket connection opened');
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
                } else if (data.type === 'fill_sample') {
                    try {
                        const sampleData = await this.generateSampleData();
                        this.activityState.formData = sampleData;
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
                    } catch (error) {
                        console.error('Sample data generation error:', error);
                        server.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to generate sample data'
                        }));
                    }
                } else if (data.type === 'submit') {
                    try {
                        // Pass the execution context to handleSubmit
                        await this.handleSubmit(data, ctx);
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
            const body = await request.json() as { partnerId: string } & (QuoteUpdate | { update: QuoteUpdate });
            
            // Handle quote updates
            if (url.pathname === '/api/update-quote' && body.partnerId) {
                console.log('[ActivityDO] Received quote update');
                await this.updateQuote(body.partnerId, body);
                return new Response(JSON.stringify({ success: true }));
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

  async handleSubmit(data: SubmitData, ctx?: ExecutionContext) {
    console.log('[ActivityDO] Starting submit with data:', JSON.stringify({
        ...data,
        turnstileToken: data.turnstileToken ? '(token present)' : undefined
    }, null, 2));
    
    if (data.activityId !== this.state.id.toString()) {
        console.error('[ActivityDO] Activity ID mismatch:', data.activityId, 'vs', this.state.id.toString());
        throw new Error('Activity ID mismatch');
    }

    // Verify Turnstile token
    try {
        if (!data.turnstileToken) {
            console.error('[ActivityDO] Missing turnstile token in request data');
            throw new Error('Security verification token is missing');
        }
        
        console.log('[ActivityDO] Verifying turnstile token');
        const verificationResult = await verifyTurnstileToken(this.env, data.turnstileToken);
        console.log('[ActivityDO] Turnstile verification successful:', verificationResult);
        
    } catch (error) {
        console.error('[ActivityDO] Turnstile verification failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Security verification failed';
        throw new Error(errorMessage);
    }

    if (!this.activityState.customerId) {
        console.error('[ActivityDO] No customer ID in state');
        throw new Error('No customer ID found');
    }

    // Update status
    this.activityState.status = 'processing';
    this.activityState.quotes = {};
    await this.updateState(this.activityState);
    console.log('[ActivityDO] Updated state to processing');

    const activityId = this.state.id.toString();
    console.log('[ActivityDO] Starting activity submission for:', activityId);

    // Start the submission process but don't wait for it
    const promise = handleActivitySubmission(this.env, activityId, this.activityState.formData);
    if (ctx) {
        console.log('[ActivityDO] Using waitUntil for background processing');
        ctx.waitUntil(promise);
    }

    // Send redirect URL immediately
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

  private async updateQuote(partnerId: string, data: { update?: QuoteUpdate } | QuoteUpdate) {
    //console.log('[ActivityDO] Updating quote with data:', data);
    console.log('[ActivityDO] Processing quote update for partner:', partnerId);
    
    // Initialize quotes object if it doesn't exist
    if (!this.activityState.quotes) {
        this.activityState.quotes = {};
    }

    // Extract the actual update data from the request
    const quoteUpdate = ('update' in data) ? data.update : data;
    
    if (!quoteUpdate) {
        throw new Error('No quote update data provided');
    }

    // Initialize or update the quote for this partner
    this.activityState.quotes[partnerId] = {
        ...this.activityState.quotes[partnerId],  // Preserve existing data
        partnerName: quoteUpdate.partnerName,
        status: quoteUpdate.status,
        updatedAt: quoteUpdate.updatedAt,
        logoUrl: quoteUpdate.logoUrl,  // Explicitly include logoUrl
        ...(quoteUpdate.price !== undefined && { price: quoteUpdate.price }),
        ...(quoteUpdate.characteristics && { characteristics: quoteUpdate.characteristics })
    };

    // Log the updated quote for debugging
    console.log('[ActivityDO] Updated quote:', this.activityState.quotes[partnerId].partnerName);
    //console.log('[ActivityDO] Updated quote:', this.activityState.quotes[partnerId]);

    // Check if all expected quotes are complete
    const completedQuotes = Object.values(this.activityState.quotes)
        .filter(q => q.status === 'complete').length;
    
    const expectedCount = this.activityState.expectedPartnerCount || 0;
    
    console.log(`[ActivityDO] Quote progress: ${completedQuotes}/${expectedCount}`);
    
    if (completedQuotes === expectedCount) {
        this.activityState.status = 'completed';
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

  private async generateSampleData(): Promise<any> {
    try {
        // Generate a company name using AI
        const aiResponse = await this.env.AI.run(
            "@cf/meta/llama-2-7b-chat-int8",
            {
                messages: [
                    {
                        role: "system",
                        content: "You are a creative assistant that generates plausible company names."
                    },
                    {
                        role: "user",
                        content: "Generate a single company name for a medium-sized technology company. Only return the name, no explanation or additional text."
                    }
                ]
            }
        );  

        const companyName = aiResponse.response.trim();

        return {
            organisation: {
                name: companyName,
                'sector-type': 'private',
                industry: 'technology',
                revenue: '500000',
                employees: '251-500',
                remote_percentage: '50'
            },
            exposure: {
                'data-pii': true,
                'data-payment': false,
                'data-health': false,
                'data-financial': false,
                'data-intellectual': true,
                'asset-websites': true,
                'asset-apis': false,
                'asset-mobile': false,
                'infra-cloud': true,
                'infra-onprem': false,
                'ai-usage': 'core'
            },
            security: {
                'security-waf': true,
                'security-api': false,
                'security-bot': true,
                'security-ddos': true,
                'security-firewall': true,
                'security-mfa': true,
                'security-zerotrust': false,
                'security-dlp': false,
                'security-encryption': true,
                'security-backup': true
            }
        };
    } catch (error) {
        console.error('[ActivityDO] Error generating sample data:', error);
        throw error;
    }
  }
} 