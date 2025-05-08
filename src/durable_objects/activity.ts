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
  status?: 'draft' | 'completed';
  updatedAt?: number;
}

export class ActivityDO {
  private state: DurableObjectState;
  private sessions: Set<WebSocket>;
  // Initialize with default state to fix "no initializer" error
  private activityState: ActivityState = {
    currentSection: 'organisation',
    formData: {}
  };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Set();
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
    // Create new state object with type safety
    const newState: ActivityState = {
      ...this.activityState,
      ...update,
      updatedAt: Date.now()
    };
    this.activityState = newState;
    await this.state.storage.put('state', this.activityState);
  }

  async fetch(request: Request): Promise<Response> {
    // Load state first - ensure we always load before handling any request
    const stored = await this.state.storage.get<ActivityState>('state');
    if (stored) {
        this.activityState = stored;
    } else {
        // Initialize state if not exists
        this.activityState = {
            currentSection: 'organisation',
            formData: {}
        };
        await this.state.storage.put('state', this.activityState);
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
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
            this.activityState.status = 'in_progress';

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
            // Handle form submission
            this.activityState.status = 'completed';
            this.activityState.updatedAt = Date.now();
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
    switch (request.method) {
      case 'GET':
        return new Response(JSON.stringify(this.activityState), {
          headers: { 'Content-Type': 'application/json' }
        });

      case 'POST':
        const update = await request.json();
        await this.updateState(update);
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });

      default:
        return new Response('Method not allowed', { status: 405 });
    }
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
    if (stored && stored.status === 'in_progress') {
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
} 