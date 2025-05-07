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

interface ActivityState {
  status: 'pending' | 'in_progress' | 'draft' | 'completed' | 'failed';
  currentSection: 'organisation' | 'security' | 'coverage' | 'review';
  formData: {
    organisation?: {
      name?: string;
      industry?: string;
      revenue?: '0-50k' | '50k-100k' | '100k-500k' | '500k-1m' | '1m-10m' | '10m-100m' | '100m-1b' | 'over-1b';
      employees?: string;
    };
    security?: {
      backupFrequency?: string;
      firewallEnabled?: boolean;
      antivirusEnabled?: boolean;
      trainingFrequency?: string;
    };
    coverage?: {
      coverageLimit?: number;
      excess?: number;
    };
  };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class ActivityDO {
  private state: DurableObjectState;
  private sessions: Set<WebSocket>;
  private activityState: ActivityState;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request: Request): Promise<Response> {
    // Load state first - ensure we always load before handling any request
    const stored = await this.state.storage.get<ActivityState>('state');
    if (stored) {
        this.activityState = stored;
    } else {
        // Initialize state if not exists
        this.activityState = {
            status: 'pending',
            currentSection: 'organisation',
            formData: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
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
              const sections = ['organisation', 'security', 'coverage', 'review'];
              const currentIndex = sections.indexOf(this.activityState.currentSection);
              if (currentIndex < sections.length - 1) {
                this.activityState.currentSection = sections[currentIndex + 1];
              }
            }

            // Save state
            await this.state.storage.put('state', this.activityState);

            // Broadcast to all clients
            const update = JSON.stringify({
              type: 'state_update',
              state: this.activityState
            });

            this.sessions.forEach(ws => {
              try {
                ws.send(update);
              } catch (err) {
                this.sessions.delete(ws);
              }
            });
          } else if (data.type === 'submit') {
            // Handle form submission
            this.activityState.status = 'completed';
            this.activityState.completedAt = Date.now();
            await this.state.storage.put('state', this.activityState);

            // Notify all clients
            const update = JSON.stringify({
              type: 'state_update',
              state: this.activityState
            });

            this.sessions.forEach(ws => {
              try {
                ws.send(update);
              } catch (err) {
                this.sessions.delete(ws);
              }
            });
          } else if (data.type === 'save_draft') {
            // Handle save draft action
            this.activityState.status = 'draft';
            await this.state.storage.put('state', this.activityState);
            
            // Notify all clients
            const update = JSON.stringify({
              type: 'state_update',
              state: this.activityState
            });
            
            this.sessions.forEach(ws => {
              try {
                ws.send(update);
              } catch (err) {
                this.sessions.delete(ws);
              }
            });
          }
        } catch (err) {
          server.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
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
        this.activityState = {
          ...this.activityState,
          ...update,
          updatedAt: Date.now()
        };
        await this.state.storage.put('state', this.activityState);
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
          try {
            ws.send(JSON.stringify({
              type: 'state_update',
              state: stored
            }));
          } catch (e) {
            this.sessions.delete(ws);
          }
        });
      }
    }
  }
} 