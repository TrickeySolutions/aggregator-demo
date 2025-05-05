export class CustomerDO {
  private state: DurableObjectState;
  private activities: Set<string>;
  private auth: { userId?: string };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.activities = new Set();
    this.auth = {};
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Load existing activities from storage
    const storedActivities = await this.state.storage.get('activities');
    if (storedActivities) {
      this.activities = new Set(storedActivities);
    }

    // Handle authentication
    const auth = request.headers.get('Authorization');
    if (auth) {
      // Verify JWT and set userId
      this.auth.userId = 'verified-user-id';
    }

    switch(request.method) {
      case 'POST':
        if (url.pathname === '/api/activities') {
          // Generate a 32-byte (64 hex char) ID for the activity
          const bytes = new Uint8Array(32);
          crypto.getRandomValues(bytes);
          const id = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          
          this.activities.add(id);
          await this.state.storage.put('activities', Array.from(this.activities));
          return new Response(JSON.stringify({ id }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;

      case 'GET':
        if (url.pathname.endsWith('/activities')) {
          return new Response(JSON.stringify({
            activities: Array.from(this.activities)
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;
    }

    return new Response('Not found', { status: 404 });
  }
} 